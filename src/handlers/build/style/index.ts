import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { pluginOptions as PostcssPresetEnvOptions } from 'postcss-preset-env';
import type { FileImporter } from 'sass';
import webpackDefault, { Configuration, LoaderContext, RuleSetUseItem, StatsAsset } from 'webpack';

import { StyleMinifyOptions, StyleOptions } from '../../../config-models/index.js';
import { InvalidCommandOptionError, InvalidConfigError } from '../../../exceptions/index.js';
import {
    LogLevelStrings,
    LoggerBase,
    colors,
    findUp,
    normalizePathToPOSIXStyle,
    pathExists,
    readJsonWithComments,
    resolvePath
} from '../../../utils/index.js';

import { getBannerOptions, getPackageJsonInfo, getSubstitutions } from '../../config-helpers/index.js';
import { BuildTask, HandlerContext } from '../../interfaces/index.js';

import { StyleWebpackPlugin } from './plugins/index.js';

const require = createRequire(process.cwd() + '/');

function mapToResultAssets(
    assets: StatsAsset[],
    outputPath: string,
    builtAssets: { path: string; size: number; emitted: boolean }[]
): void {
    for (const asset of assets) {
        builtAssets.push({
            path: path.resolve(outputPath, asset.name),
            size: asset.size,
            emitted: asset.emitted
        });

        if (asset.related && Array.isArray(asset.related)) {
            mapToResultAssets(asset.related, outputPath, builtAssets);
        }
    }
}

async function runWebpack(webpackConfig: Configuration, outDir: string): Promise<StyleBundleResult> {
    const webpackCompiler = webpackDefault(webpackConfig);

    return new Promise((resolve, reject) => {
        webpackCompiler.run((err, stats) => {
            if (err) {
                reject(err);

                return;
            }

            const statsJson = stats?.toJson({
                version: false,
                hash: false,
                publicPath: false,
                chunks: false,
                chunkGroups: false,
                modules: false,
                entrypoints: false,
                errors: false,
                errorsCount: false,
                warnings: false,
                warningsCount: false,
                builtAt: false,
                children: false,

                timings: true,
                outputPath: true,
                assets: true
            });

            const outputPath = statsJson?.outputPath ?? outDir;

            const result: StyleBundleResult = {
                builtAssets: [],
                time: statsJson?.time ?? 0
            };

            mapToResultAssets(statsJson?.assets ?? [], outputPath, result.builtAssets);

            webpackCompiler.close(() => {
                resolve(result);
            });
        });
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

async function tryUnderscoreResolve(
    resolve: ReturnType<LoaderContext<{}>['getResolve']>,
    url: string,
    workspaceRoot: string
): Promise<string | undefined> {
    try {
        return await resolve(workspaceRoot, url);
    } catch {
        // Try to resolve a partial file
        // @use '@material/button/button' as mdc-button;
        // `@material/button/button` -> `@material/button/_button`
        const lastSlashIndex = url.lastIndexOf('/');
        const underscoreIndex = lastSlashIndex + 1;
        if (underscoreIndex > 0 && url.charAt(underscoreIndex) !== '_') {
            const partialFileUrl = `${url.slice(0, underscoreIndex)}_${url.slice(underscoreIndex)}`;

            return resolve(workspaceRoot, partialFileUrl).catch(() => undefined);
        }
    }

    return undefined;
}

function getSassUnderscoreImporter(loaderContext: LoaderContext<{}>, workspaceRoot: string): FileImporter<'async'> {
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

            let result = await tryUnderscoreResolve(resolve, url, workspaceRoot);

            if (!result && previousResolvedModules) {
                for (const path of previousResolvedModules) {
                    result = await tryUnderscoreResolve(resolve, url, path);
                    if (result) {
                        break;
                    }
                }
            }

            return result ? pathToFileURL(result) : null;
        }
    };
}

/**
 * @internal
 */
export interface StyleTaskRunnerOptions {
    readonly styleOptions: Readonly<StyleOptions>;
    readonly outDir: string;
    readonly buildTask: Readonly<BuildTask>;
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings;
    readonly dryRun: boolean;
    readonly env: string | undefined;
}

/**
 * @internal
 */
export interface StyleBundleResult {
    readonly builtAssets: { path: string; size: number; emitted: boolean }[];
    readonly time: number;
}

/**
 * @internal
 */
export class StyleTaskRunner {
    private readonly logger: LoggerBase;

    constructor(readonly options: StyleTaskRunnerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<StyleBundleResult> {
        this.logger.group('\u25B7 style');

        const styleOptions = this.options.styleOptions;

        const { workspaceRoot } = this.options.buildTask;
        const substitutions = await getSubstitutions(styleOptions.substitutions ?? [], this.options.buildTask);
        const bannerOptions = await getBannerOptions(
            'banner',
            'style',
            styleOptions.banner,
            this.options.buildTask,
            substitutions
        );
        const footerOptions = await getBannerOptions(
            'footer',
            'style',
            styleOptions.footer,
            this.options.buildTask,
            substitutions
        );

        // entryPoints
        const entryPoints = await this.getEntryPoints();

        // posscss options
        const postcssOptions = await this.loadPostcssOptions();

        // minify options
        const minify = styleOptions.minify !== false ? true : false;
        let separateMinifyFile = minify;
        let sourceMapInMinifyFile = false;
        let minimizerOptions: Record<string, unknown> | null = null;
        if (minify) {
            const styleMinifyOptions: StyleMinifyOptions =
                typeof styleOptions.minify === 'object' ? styleOptions.minify : {};

            separateMinifyFile = styleMinifyOptions.separateMinifyFile !== false ? true : false;
            sourceMapInMinifyFile = separateMinifyFile && styleMinifyOptions.sourceMapInMinifyFile ? true : false;
            minimizerOptions = await this.loadCssnanoOptions();
        }

        // sourceMap
        const sourceMap = styleOptions.sourceMap ?? true;

        // includePaths
        const absoluteIncludePaths = await this.getIncludePaths();

        const getSharedCssRuleUseItems = (importLoaders = 0): RuleSetUseItem[] => {
            return [
                {
                    loader: MiniCssExtractPlugin.loader
                },
                {
                    loader: require.resolve('css-loader'),
                    options: {
                        // We don't parse css url function
                        url: false, // Default: true
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
                        implementation: require.resolve('postcss'),
                        sourceMap,
                        postcssOptions
                    }
                }
            ];
        };

        const webpackConfig: Configuration = {
            devtool: sourceMap ? 'source-map' : false,
            mode: 'production',
            entry: entryPoints,
            output: {
                path: this.options.outDir
            },
            plugins: [
                new MiniCssExtractPlugin({
                    filename: '[name].css'
                }),
                new StyleWebpackPlugin({
                    logger: this.logger,
                    logLevel: this.options.logLevel,
                    dryRun: this.options.dryRun,
                    outDir: this.options.outDir,
                    separateMinifyFile,
                    sourceMapInMinifyFile,
                    banner: bannerOptions,
                    footer: footerOptions
                })
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
                                        importers: [getSassUnderscoreImporter(loaderContext, workspaceRoot)],
                                        loadPaths: absoluteIncludePaths,
                                        // Use expanded as otherwise sass will remove comments that are needed for autoprefixer
                                        // Ex: /* autoprefixer grid: autoplace */
                                        // See: https://github.com/webpack-contrib/sass-loader/blob/45ad0be17264ceada5f0b4fb87e9357abe85c4ff/src/getSassOptions.js#L68-L70
                                        style: 'expanded',
                                        quietDeps: this.options.logLevel === 'debug' ? false : true,
                                        verbose: this.options.logLevel === 'debug' ? true : false,
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
                                        paths: absoluteIncludePaths
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
                              test: separateMinifyFile ? /\.min\.css(\?.*)?$/i : /\.css(\?.*)?$/i,
                              warningsFilter: () => {
                                  return this.options.logLevel === 'error' ? false : true;
                              },
                              minimizerOptions: minimizerOptions ?? { preset: 'default' }
                          })
                      ]
                    : []
            }
        };

        const result = await runWebpack(webpackConfig, this.options.outDir);

        this.logger.groupEnd();
        this.logger.info(`${colors.lightGreen('\u25B6')} style [${colors.lightGreen(`${result.time} ms`)}]`);

        return result;
    }

    private async getEntryPoints(): Promise<Record<string, string[]>> {
        const { projectRoot, projectName, taskName, configPath } = this.options.buildTask;
        const styleOptions = this.options.styleOptions;
        const supportdStyleExtRegExp = /\.(sa|sc|le|c)ss$/i;

        const entryPoints: Record<string, string[]> = {};
        for (let i = 0; i < styleOptions.compilations.length; i++) {
            const bundle = styleOptions.compilations[i];

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
                        `projects/${projectName}/tasks/${taskName}/style/compilations/[${i}]/entry`
                    );
                } else {
                    throw new InvalidCommandOptionError('style', bundle.entry, errMsg);
                }
            }

            if (!(await pathExists(entryFilePath))) {
                const errMsg = `Style entry file '${bundle.entry}' doesn't exist.`;
                if (projectName) {
                    throw new InvalidConfigError(
                        errMsg,
                        configPath,
                        `projects/${projectName}/tasks/${taskName}/style/compilations/[${i}]/entry`
                    );
                } else {
                    throw new InvalidCommandOptionError('style', bundle.entry, errMsg);
                }
            }

            // out
            let outFileRelToOutDir: string;
            const trimedOut = bundle.out?.trim();
            if (trimedOut?.length) {
                if (trimedOut.endsWith('/')) {
                    const outFileName = path.basename(entryFilePath).replace(supportdStyleExtRegExp, '.css');
                    const outFilePath = resolvePath(this.options.outDir, path.join(trimedOut, outFileName));
                    outFileRelToOutDir = normalizePathToPOSIXStyle(path.relative(this.options.outDir, outFilePath));
                } else if (/\.css$/i.test(trimedOut) && normalizePathToPOSIXStyle(trimedOut).length > 4) {
                    const outFilePath = resolvePath(this.options.outDir, trimedOut);
                    outFileRelToOutDir = normalizePathToPOSIXStyle(path.relative(this.options.outDir, outFilePath));
                } else {
                    const outFilePath = resolvePath(this.options.outDir, trimedOut + '.css');
                    outFileRelToOutDir = normalizePathToPOSIXStyle(path.relative(this.options.outDir, outFilePath));
                }
            } else {
                outFileRelToOutDir = path.basename(entryFilePath).replace(supportdStyleExtRegExp, '.css');
            }

            const outAssetName = outFileRelToOutDir.substring(0, outFileRelToOutDir.length - 4);
            entryPoints[outAssetName] = entryPoints[outAssetName] ?? [];
            if (!entryPoints[outAssetName].includes(entryFilePath)) {
                entryPoints[outAssetName].push(entryFilePath);
            }
        }

        return entryPoints;
    }

    private async getIncludePaths(): Promise<string[] | undefined> {
        if (!this.options.styleOptions.includePaths) {
            return undefined;
        }

        const { workspaceRoot, projectRoot, projectName, taskName, configPath } = this.options.buildTask;

        const includePaths: string[] = [];
        const node_modules = 'node_modules';

        const nodeModulePath = await findUp(node_modules, workspaceRoot, path.parse(workspaceRoot).root);

        for (const p of this.options.styleOptions.includePaths) {
            const normalizedPath = normalizePathToPOSIXStyle(p);

            let foundPath: string | null = null;

            foundPath = await findUp(normalizedPath, null, projectRoot);

            if (!foundPath && nodeModulePath && normalizedPath.startsWith(node_modules)) {
                foundPath = await findUp(normalizedPath.substring(node_modules.length), null, nodeModulePath);
            }

            if (!foundPath && nodeModulePath && p.startsWith('~')) {
                foundPath = await findUp(p.substring(1), null, nodeModulePath);
            }

            if (!foundPath) {
                throw new InvalidConfigError(
                    `IncludePath '${p}' doesn't exist.`,
                    configPath,
                    `projects/${projectName ?? '0'}/tasks/${taskName}/style/includePaths`
                );
            }

            if (!includePaths.includes(foundPath)) {
                includePaths.push(foundPath);
            }
        }

        return includePaths;
    }

    private async loadPostcssOptions(): Promise<Record<string, unknown>> {
        const defaultStage = 3;

        if (this.options.styleOptions.target) {
            const cssTargetOptions = this.options.styleOptions.target;
            const presetEnvOptions: PostcssPresetEnvOptions = {
                ...cssTargetOptions,
                debug: this.options.logLevel === 'debug' ? true : false
            };

            if (cssTargetOptions.stage == null) {
                presetEnvOptions.stage = defaultStage;
            }

            if (this.options.env) {
                presetEnvOptions.env = this.options.env;
                presetEnvOptions.autoprefixer = presetEnvOptions.autoprefixer ?? {};
                presetEnvOptions.autoprefixer.env = this.options.env;
            }

            if (cssTargetOptions.browers != null) {
                presetEnvOptions.autoprefixer = presetEnvOptions.autoprefixer ?? {};
                presetEnvOptions.autoprefixer = {
                    overrideBrowserslist: cssTargetOptions.browers
                };
            }

            return {
                plugins: [
                    [
                        require.resolve('postcss-preset-env'),
                        // options
                        presetEnvOptions
                    ]
                ]
            };
        }

        const testConfigPaths = [
            'postcss.config.json',
            '.postcssrc.json',
            '.postcssrc',
            'postcss.config.mjs',
            '.postcssrc.mjs',
            'postcss.config.cjs',
            '.postcssrc.cjs',
            'postcss.config.js',
            '.postcssrc.js'
        ];

        const pluginOptions = await this.tryLoadOptions('postcss', testConfigPaths);
        if (pluginOptions) {
            return pluginOptions;
        }

        return {
            plugins: [
                [
                    require.resolve('postcss-preset-env'),
                    {
                        stage: defaultStage,
                        env: this.options.env,
                        debug: this.options.logLevel === 'debug' ? true : false
                    } as PostcssPresetEnvOptions
                ]
            ]
        };
    }

    private loadCssnanoOptions(): Promise<Record<string, unknown> | null> {
        const testConfigPaths = [
            'cssnano.config.json',
            '.cssnanorc.config.json',
            '.cssnanorc',
            'cssnano.config.mjs',
            '.cssnanorc.mjs',
            'cssnano.config.cjs',
            '.cssnanorc.cjs',
            'cssnano.config.js',
            '.cssnanorc.js'
        ];

        return this.tryLoadOptions('cssnano', testConfigPaths);
    }

    private async tryLoadOptions(
        optionName: string,
        testConfigPaths: string[]
    ): Promise<Record<string, unknown> | null> {
        const { workspaceRoot } = this.options.buildTask;

        let foundPath: string | null = null;
        for (const p of testConfigPaths) {
            const pAbs = path.resolve(workspaceRoot, p);
            if (await pathExists(pAbs)) {
                foundPath = pAbs;
                break;
            }
        }

        if (foundPath) {
            this.logger.debug(
                `Reading ${optionName} options from configuration file ${normalizePathToPOSIXStyle(
                    path.relative(process.cwd(), foundPath)
                )}.`
            );

            try {
                if (/\.json|rc$/i.test(foundPath)) {
                    const options = await readJsonWithComments(foundPath);

                    return options as Record<string, unknown>;
                } else {
                    const optionsModule = (await import(pathToFileURL(foundPath).toString())) as {
                        default?: (ctx: unknown) => Record<string, unknown>;
                    };

                    if (optionsModule.default) {
                        if (typeof optionsModule.default === 'function') {
                            const options = optionsModule.default({
                                env: this.options.env,
                                logLevel: this.options.logLevel,
                                logger: this.logger
                            });

                            return options;
                        } else {
                            return optionsModule.default;
                        }
                    } else {
                        this.logger.debug(
                            `${colors.lightYellow(
                                'Failed:'
                            )} Reading ${optionName} options from configuration file ${normalizePathToPOSIXStyle(
                                path.relative(process.cwd(), foundPath)
                            )} failed because no default export.`
                        );

                        return null;
                    }
                }
            } catch (err) {
                this.logger.debug(
                    `${colors.lightYellow(
                        'Failed:'
                    )} Reading ${optionName} options from configuration file ${normalizePathToPOSIXStyle(
                        path.relative(process.cwd(), foundPath)
                    )} failed.`
                );

                return null;
            }
        }

        const packageJsonInfo = await getPackageJsonInfo(this.options.buildTask);
        if (
            packageJsonInfo?.rootPackageJsonPath &&
            packageJsonInfo.rootPackageJsonConfig?.[optionName] &&
            typeof packageJsonInfo.rootPackageJsonConfig[optionName] === 'object'
        ) {
            this.logger.debug(
                `Reading ${optionName} options from package.json file ${normalizePathToPOSIXStyle(
                    path.relative(process.cwd(), packageJsonInfo.rootPackageJsonPath)
                )}.`
            );

            return packageJsonInfo.rootPackageJsonConfig[optionName] as Record<string, unknown>;
        }

        return null;
    }
}

/**
 * @internal
 */
export function getStyleTaskRunner(
    buildTask: Readonly<BuildTask>,
    context: Readonly<HandlerContext>
): StyleTaskRunner | null {
    if (!buildTask.style) {
        return null;
    }

    let styleOptions: StyleOptions = {
        compilations: []
    };

    if (Array.isArray(buildTask.style)) {
        for (const styleFile of buildTask.style) {
            styleOptions.compilations.push({
                entry: styleFile
            });
        }
    } else {
        styleOptions = buildTask.style;
    }

    if (!styleOptions.compilations.filter((b) => b.entry?.trim().length).length) {
        return null;
    }

    const taskRunner = new StyleTaskRunner({
        styleOptions,
        outDir: buildTask.outDir,
        buildTask,
        logger: context.logger,
        logLevel: context.logLevel,
        dryRun: context.dryRun,
        env: context.env
    });

    return taskRunner;
}
