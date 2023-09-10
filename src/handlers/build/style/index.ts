import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FileImporter } from 'sass';
import { Configuration, LoaderContext, RuleSetUseItem, Stats } from 'webpack';
import * as webpack from 'webpack';

import { StyleOptions } from '../../../config-models/index.js';
import { PackageJsonInfo, WorkspaceInfo } from '../../../config-models/parsed/index.js';
import { InvalidCommandOptionError, InvalidConfigError, WebpackCompilationError } from '../../../exceptions/index.js';
import {
    LogLevelString,
    Logger,
    colors,
    normalizePathToPOSIXStyle,
    pathExists,
    readJsonWithComments,
    resolvePath
} from '../../../utils/index.js';

import { BuildTaskHandleContext } from '../../interfaces/index.js';

import { SuppressJsWebpackPlugin } from './plugins/index.js';

const require = createRequire(process.cwd() + '/');

async function runWebpack(webpackConfig: Configuration, logger: Logger, logLevel: LogLevelString): Promise<unknown> {
    const webpackCompiler = webpack.default(webpackConfig);

    return new Promise((resolve, reject) => {
        const cb = (err?: Error | null, stats?: Stats) => {
            if (err) {
                // console.error(err.stack || err);
                // if (err.details) {
                //     console.error(err.details);
                // }
                reject(err);

                return;
            }

            if (stats) {
                if (stats.hasErrors()) {
                    let errorMessage = '';

                    if (logLevel === 'debug') {
                        errorMessage = stats.toString('errors-only');
                    } else {
                        const errors = stats.toJson('errors-only').errors ?? [];
                        const errorLines: string[] = [];
                        for (const err of errors) {
                            if (!err.moduleName) {
                                continue;
                            }

                            const moduleIdentifiers = err.moduleName.split('!');
                            if (!moduleIdentifiers.length) {
                                continue;
                            }

                            let formattedLine = '';

                            const errorFilePath = moduleIdentifiers[moduleIdentifiers.length - 1];
                            formattedLine += colors.cyan(normalizePathToPOSIXStyle(errorFilePath));
                            if (err.loc) {
                                formattedLine += colors.yellow(':' + err.loc);
                            }
                            formattedLine += ' ';

                            const formatedSubLines: string[] = [];
                            for (let subLine of err.message.split(/[\r\n]/)) {
                                subLine = subLine.trim();
                                if (!subLine) {
                                    continue;
                                }

                                if (
                                    subLine.includes(
                                        'Module build failed (from ./node_modules/mini-css-extract-plugin/dist/loader.js):'
                                    )
                                ) {
                                    continue;
                                }

                                if (!formatedSubLines.length) {
                                    const errPrefixRegExp = /^(\w*[\s\w]*\s?[:]?\s?Error:\s)/i;
                                    const m = subLine.match(errPrefixRegExp);
                                    if (m?.length) {
                                        let errPrefix = m[0].replace(/\s?:\s?/, ' ').trim();
                                        if (!errPrefix.endsWith(':')) {
                                            errPrefix += ':';
                                        }
                                        if (errPrefix.split(' ').length > 1) {
                                            errPrefix = errPrefix[0] + errPrefix.substring(1).toLowerCase();
                                        }
                                        subLine = colors.red(errPrefix) + ' ' + subLine.replace(errPrefixRegExp, '');
                                    }
                                } else if (
                                    ((subLine.startsWith('at ') || subLine.startsWith('in ')) &&
                                        subLine.includes('node_modules\\')) ||
                                    subLine.includes('node_modules/')
                                ) {
                                    break;
                                }

                                formatedSubLines.push(subLine);
                            }

                            formattedLine += formatedSubLines.join(' ');
                            errorLines.push(formattedLine.trim());
                        }

                        errorMessage = colors.red('Running style task failed.') + '\n' + errorLines.join('\n');
                    }

                    reject(new WebpackCompilationError(errorMessage));

                    return;
                }

                if (logLevel === 'debug') {
                    const msg = stats.toString('detailed');
                    if (msg?.trim()) {
                        logger.info(msg);
                    }
                } else {
                    const msg = stats.toString('errors-warnings');
                    if (msg?.trim()) {
                        logger.warn(msg);
                    }
                }
            }

            webpackCompiler.close(() => {
                resolve(null);
            });
        };

        webpackCompiler.run(cb);
    });
}

type FileImporterOptions = Parameters<FileImporter['findFileUrl']>[1];

interface FileImporterWithRequestContextOptions extends FileImporterOptions {
    /**
     * This is a custom option and is required as SASS does not provide context from which the file is being resolved.
     * This breaks Yarn PNP as transitive deps cannot be resolved from the workspace root.
     *
     * Workaround until https://github.com/sass/sass/issues/3247 is addressed.
     */
    previousResolvedModules?: Set<string>;

    /**
     * The base directory to use when resolving the request.
     * This value is only set if using the rebasing importers.
     */
    resolveDir?: string;
}

async function tryResolve(
    resolve: ReturnType<LoaderContext<{}>['getResolve']>,
    root: string,
    url: string
): Promise<string | undefined> {
    try {
        return await resolve(root, url);
    } catch {
        // Try to resolve a partial file
        // @use '@material/button/button' as mdc-button;
        // `@material/button/button` -> `@material/button/_button`
        const lastSlashIndex = url.lastIndexOf('/');
        const underscoreIndex = lastSlashIndex + 1;
        if (underscoreIndex > 0 && url.charAt(underscoreIndex) !== '_') {
            const partialFileUrl = `${url.slice(0, underscoreIndex)}_${url.slice(underscoreIndex)}`;

            return resolve(root, partialFileUrl).catch(() => undefined);
        }
    }

    return undefined;
}

function getSassResolutionImporter(loaderContext: LoaderContext<{}>, workspaceRoot: string): FileImporter<'async'> {
    const commonResolverOptions: Parameters<(typeof loaderContext)['getResolve']>[0] = {
        conditionNames: ['sass', 'style'],
        mainFields: ['sass', 'style', 'main', '...'],
        extensions: ['.scss', '.sass', '.css'],
        restrictions: [/\.((sa|sc|c)ss)$/i],
        preferRelative: true,
        symlinks: true
    };

    // Sass also supports import-only files. If you name a file <name>.import.scss, it will only be loaded for imports, not for @uses.
    // See: https://sass-lang.com/documentation/at-rules/import#import-only-files
    const resolveImport = loaderContext.getResolve({
        ...commonResolverOptions,
        dependencyType: 'sass-import',
        mainFiles: ['_index.import', '_index', 'index.import', 'index', '...']
    });

    const resolveModule = loaderContext.getResolve({
        ...commonResolverOptions,
        dependencyType: 'sass-module',
        mainFiles: ['_index', 'index', '...']
    });

    return {
        findFileUrl: async (
            url,
            { fromImport, previousResolvedModules }: FileImporterWithRequestContextOptions
        ): Promise<URL | null> => {
            if (url.startsWith('.')) {
                // Let Sass handle relative imports.
                return null;
            }

            const resolve = fromImport ? resolveImport : resolveModule;
            // Try to resolve from root of workspace
            let result = await tryResolve(resolve, workspaceRoot, url);

            // Try to resolve from previously resolved modules.
            if (!result && previousResolvedModules) {
                for (const path of previousResolvedModules) {
                    result = await tryResolve(resolve, path, url);
                    if (result) {
                        break;
                    }
                }
            }

            return result ? pathToFileURL(result) : null;
        }
    };
}

export interface StyleTaskRunnerOptions {
    readonly styleOptions: StyleOptions;
    readonly workspaceInfo: WorkspaceInfo;
    readonly outDir: string;
    readonly dryRun: boolean;
    readonly logger: Logger;
    readonly logLevel: LogLevelString;
    readonly packageJsonInfo: PackageJsonInfo | null;
}

export interface StyleBundleResult {
    readonly files: string[];
}
export class StyleTaskRunner {
    private readonly logger: Logger;

    constructor(readonly options: StyleTaskRunnerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<StyleBundleResult> {
        const workspaceInfo = this.options.workspaceInfo;
        const workspaceRoot = workspaceInfo.workspaceRoot;
        const projectRoot = workspaceInfo.projectRoot;
        const packageJsonInfo = this.options.packageJsonInfo;
        const logLevel = this.options.logLevel;

        const styleOptions = this.options.styleOptions;

        // sourceMap
        const sourceMap = styleOptions.sourceMap ?? true;

        // minify
        const minify = styleOptions.minify ?? true;
        let cssnanoOptions: Record<string, unknown> | null = null;
        if (minify) {
            const cssnanoConfigFilePath = path.resolve(workspaceRoot, '.cssnanorc.config.json');
            if (await pathExists(cssnanoConfigFilePath)) {
                cssnanoOptions = (await readJsonWithComments(cssnanoConfigFilePath)) as Record<string, unknown>;
            } else if (
                packageJsonInfo?.packageJson?.cssnano &&
                typeof packageJsonInfo.packageJson.cssnano === 'object'
            ) {
                cssnanoOptions = { ...packageJsonInfo.packageJson.cssnano };
            }
        }

        // loadPaths
        const absoluteLoadPaths = styleOptions.loadPaths?.map((loadPath) => resolvePath(projectRoot, loadPath));

        // entryPoints
        const entryPoints = await this.getEntryPoints();

        const getSharedCssRuleUseItems = (importLoaders = 0): RuleSetUseItem[] => {
            return [
                {
                    loader: MiniCssExtractPlugin.loader
                },
                {
                    loader: require.resolve('css-loader'),
                    options: {
                        // We don't parse css url function
                        // url: false, // Default: true
                        sourceMap,
                        // 0 => no loaders (default);
                        // 1 => postcss-loader;
                        // 2 => postcss-loader, sass-loader
                        importLoaders: importLoaders + 1
                    }
                },
                {
                    loader: require.resolve('postcss-loader'),
                    options: {
                        // implementation: require('postcss'),
                        sourceMap
                        // postcssOptions: {
                        //     plugins: [
                        //         'postcss-preset-env'
                        //         // Or
                        //     ]
                        // }
                    }
                }
            ];
        };

        const webpackConfig: Configuration = {
            devtool: sourceMap ? 'source-map' : false,
            entry: entryPoints,
            output: {
                path: this.options.outDir
            },
            plugins: [
                new MiniCssExtractPlugin({
                    filename: '[name].css'
                }),
                new SuppressJsWebpackPlugin()
            ],
            module: {
                rules: [
                    {
                        test: /\.css$/i,
                        use: [...getSharedCssRuleUseItems()]
                    },
                    {
                        test: /\.(sa|sc)ss$/i,
                        use: [
                            ...getSharedCssRuleUseItems(2),
                            {
                                loader: require.resolve('resolve-url-loader'),
                                options: {
                                    sourceMap
                                }
                            },
                            {
                                loader: require.resolve('sass-loader'),
                                options: {
                                    // source-maps required for loaders preceding resolve-url-loader (regardless of devtool).
                                    sourceMap: true,

                                    // Prefer Dart Sass
                                    // implementation: require('sass'),

                                    // Webpack importer is only implemented in the legacy API and we have our own custom Webpack importer.
                                    // See: https://github.com/webpack-contrib/sass-loader/blob/997f3eb41d86dd00d5fa49c395a1aeb41573108c/src/utils.js#L642-L651
                                    webpackImporter: false,

                                    // "modern" API is experimental, so some features may not work
                                    // (known: built-in importer is not working and files with errors is not watching on initial run),
                                    // you can follow this https://github.com/webpack-contrib/sass-loader/issues/774
                                    api: 'modern',

                                    sassOptions: (loaderContext: LoaderContext<{}>) => ({
                                        importers: [getSassResolutionImporter(loaderContext, workspaceRoot)],
                                        loadPaths: absoluteLoadPaths,
                                        // Use expanded as otherwise sass will remove comments that are needed for autoprefixer
                                        // Ex: /* autoprefixer grid: autoplace */
                                        // See: https://github.com/webpack-contrib/sass-loader/blob/45ad0be17264ceada5f0b4fb87e9357abe85c4ff/src/getSassOptions.js#L68-L70
                                        style: 'expanded',
                                        quietDeps: logLevel === 'debug' ? false : true,
                                        verbose: logLevel === 'debug' ? true : false,
                                        // syntax: SassSyntax ? 'indented' : 'scss',
                                        sourceMapIncludeSources: true
                                    })
                                }
                            }
                        ]
                    },
                    {
                        test: /\.less$/i,
                        use: [
                            ...getSharedCssRuleUseItems(1),
                            {
                                loader: require.resolve('less-loader'),
                                options: {
                                    sourceMap,
                                    lessOptions: {
                                        paths: absoluteLoadPaths
                                    }
                                }
                            }
                        ]
                    }
                ]
            },
            optimization: {
                minimize: minify,
                minimizer: minify
                    ? [
                          new CssMinimizerPlugin({
                              warningsFilter: () => {
                                  return logLevel === 'error' ? false : true;
                              },
                              minimizerOptions: cssnanoOptions
                                  ? { ...cssnanoOptions }
                                  : {
                                        preset: 'default'
                                    }
                          })
                      ]
                    : []
            },
            stats: 'errors-only'
        };

        await runWebpack(webpackConfig, this.logger, logLevel);

        return { files: [] };
    }

    async getEntryPoints(): Promise<Record<string, string[]>> {
        const projectRoot = this.options.workspaceInfo.projectRoot;
        const projectName = this.options.workspaceInfo.projectName;
        const configPath = this.options.workspaceInfo.configPath;
        const styleOptions = this.options.styleOptions;
        const supportdStyleExtRegExp = /\.(sa|sc|le|c)ss$/i;

        const entryPoints: Record<string, string[]> = {};
        for (let i = 0; i < styleOptions.bundles.length; i++) {
            const bundle = styleOptions.bundles[i];

            // entry
            const normalizedEntry = normalizePathToPOSIXStyle(bundle.entry);
            const entryFilePath = resolvePath(projectRoot, normalizedEntry);

            // Validation
            //
            if (!normalizedEntry || normalizedEntry.length < 5 || !supportdStyleExtRegExp.test(normalizedEntry)) {
                const errMsg = `Unsupported style entry file '${bundle.entry}'.`;
                if (projectName) {
                    throw new InvalidConfigError(
                        errMsg,
                        configPath,
                        `projects/${projectName}/tasks/build/style/bundles/[${i}]/entry`
                    );
                } else {
                    throw new InvalidCommandOptionError(errMsg, 'style');
                }
            }

            if (!(await pathExists(entryFilePath))) {
                const errMsg = `Style entry file '${bundle.entry}' doesn't exist.`;
                if (projectName) {
                    throw new InvalidConfigError(
                        errMsg,
                        configPath,
                        `projects/${projectName}/tasks/build/style/bundles/[${i}]/entry`
                    );
                } else {
                    throw new InvalidCommandOptionError(errMsg, 'style');
                }
            }

            // out
            let outFileRelToOutDir: string;
            const trimedOut = bundle.out?.trim();
            if (trimedOut?.length) {
                if (trimedOut.endsWith('/')) {
                    const outFileName = path.basename(entryFilePath).replace(supportdStyleExtRegExp, '.css');
                    const outFilePath = path.resolve(
                        this.options.outDir,
                        normalizePathToPOSIXStyle(trimedOut),
                        outFileName
                    );
                    outFileRelToOutDir = normalizePathToPOSIXStyle(path.relative(this.options.outDir, outFilePath));
                } else if (/\.css$/i.test(trimedOut) && normalizePathToPOSIXStyle(trimedOut).length > 4) {
                    const outFilePath = path.resolve(this.options.outDir, normalizePathToPOSIXStyle(trimedOut));
                    outFileRelToOutDir = normalizePathToPOSIXStyle(path.relative(this.options.outDir, outFilePath));
                } else {
                    const outFilePath = path.resolve(
                        this.options.outDir,
                        normalizePathToPOSIXStyle(trimedOut + '.css')
                    );
                    outFileRelToOutDir = normalizePathToPOSIXStyle(path.relative(this.options.outDir, outFilePath));
                }
            } else {
                outFileRelToOutDir = path.basename(entryFilePath).replace(supportdStyleExtRegExp, '.css');
            }

            const chunkName = outFileRelToOutDir.substring(0, outFileRelToOutDir.length - 4);
            entryPoints[chunkName] = entryPoints[chunkName] ?? [];
            if (!entryPoints[chunkName].includes(entryFilePath)) {
                entryPoints[chunkName].push(entryFilePath);
            }
        }

        return entryPoints;
    }
}

export function getStyleTaskRunner(context: BuildTaskHandleContext): StyleTaskRunner | null {
    const buildTask = context.taskOptions;

    if (!buildTask.style) {
        return null;
    }

    let styleOptions: StyleOptions = {
        bundles: []
    };

    if (Array.isArray(buildTask.style)) {
        for (const styleFile of buildTask.style) {
            styleOptions.bundles.push({
                entry: styleFile
            });
        }
    } else {
        styleOptions = buildTask.style;
    }

    if (!styleOptions.bundles.filter((b) => b.entry?.trim().length).length) {
        return null;
    }

    const copyTaskRunner = new StyleTaskRunner({
        styleOptions,
        workspaceInfo: buildTask._workspaceInfo,
        outDir: buildTask._outDir,
        dryRun: context.dryRun,
        logger: context.logger,
        logLevel: context.logLevel,
        packageJsonInfo: buildTask._packageJsonInfo
    });

    return copyTaskRunner;
}
