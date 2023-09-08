import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import * as path from 'node:path';
import postcssPresetEnv from 'postcss-preset-env';
import { Configuration, Stats, webpack } from 'webpack';

import { InvalidCommandOptionError, InvalidConfigError } from '../../../exceptions/index.js';
import { StyleOptions } from '../../../models/index.js';
import { PackageJsonInfo, ParsedBuildTask, WorkspaceInfo } from '../../../models/parsed/index.js';
import {
    LogLevelString,
    Logger,
    isWindowsStyleAbsolute,
    normalizePathToPOSIXStyle,
    pathExists,
    readJsonWithComments
} from '../../../utils/index.js';

export interface StyleTaskRunnerOptions {
    readonly logger: Logger;
    readonly logLevel: LogLevelString;
    readonly styleOptions: StyleOptions;
    readonly workspaceInfo: WorkspaceInfo;
    readonly packageJsonInfo: PackageJsonInfo | null;
    readonly outDir: string;
    readonly dryRun: boolean;
}

export interface StyleBundleResult {
    readonly files: string[];
}

const styleFileTestRegExp = /\.(s[ac]|c)ss$/i;

export async function runWebpack(webpackConfig: Configuration, logger: Logger): Promise<unknown> {
    const webpackCompiler = webpack(webpackConfig);
    const statsOptions = webpackConfig.stats;

    return new Promise((resolve, reject) => {
        const cb = (err?: Error | null, stats?: Stats) => {
            if (err) {
                reject(err);

                return;
            }

            if (stats?.hasErrors()) {
                logger.error(stats.toString('errors-only'));

                reject();

                return;
            }

            if (statsOptions && stats) {
                const result = stats.toString(statsOptions);
                if (result?.trim()) {
                    logger.info(result);
                }
            }

            // if (watch) {
            //     return;
            // }

            webpackCompiler.close(() => {
                resolve(null);
            });
        };

        webpackCompiler.run(cb);
    });
}

export class StyleTaskRunner {
    private readonly logger: Logger;

    constructor(readonly options: StyleTaskRunnerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<StyleBundleResult> {
        const workspaceRoot = this.options.workspaceInfo.workspaceRoot;
        const projectRoot = this.options.workspaceInfo.projectRoot;
        const projectName = this.options.workspaceInfo.projectName;
        const configPath = this.options.workspaceInfo.configPath;
        const styleOptions = this.options.styleOptions;
        const logLevel = this.options.logLevel;

        const webpackConfigs: Configuration[] = [];

        for (let i = 0; i < styleOptions.bundles.length; i++) {
            const bundle = styleOptions.bundles[i];

            // entry
            const normalizedEntry = normalizePathToPOSIXStyle(bundle.entry);
            const entryFilePath =
                isWindowsStyleAbsolute(bundle.entry) && process.platform === 'win32'
                    ? path.resolve(normalizedEntry)
                    : path.resolve(projectRoot, normalizedEntry);
            if (!normalizedEntry || !styleFileTestRegExp.test(normalizedEntry)) {
                const errMsg = `Unsupported style input entry file '${bundle.entry}'.`;
                if (projectName) {
                    throw new InvalidConfigError(
                        errMsg,
                        configPath,
                        `projects/${projectName}/tasks/build/style/bundles/[${i}]/.entry`
                    );
                } else {
                    throw new InvalidCommandOptionError(errMsg, 'style');
                }
            }
            if (!(await pathExists(normalizedEntry))) {
                const errMsg = `Style entry file '${bundle.entry}' doesn't exist.`;
                if (projectName) {
                    throw new InvalidConfigError(
                        errMsg,
                        configPath,
                        `projects/${projectName}/tasks/build/style/bundles/[${i}]/.entry`
                    );
                } else {
                    throw new InvalidCommandOptionError(errMsg, 'style');
                }
            }

            // out
            let outputFileName: string;
            let outDir = this.options.outDir;
            if (bundle.out?.trim().length) {
                const trimedOut = bundle.out.trim();
                const extName = path.extname(trimedOut);

                if (!extName || trimedOut.endsWith('/')) {
                    outputFileName = path.basename(entryFilePath).replace(styleFileTestRegExp, '.css');
                    outDir = path.resolve(this.options.outDir, normalizePathToPOSIXStyle(trimedOut));
                } else {
                    if (!/\.css$/i.test(extName)) {
                        const errMsg = `Unsupported style output file '${bundle.out}'.`;
                        throw new InvalidConfigError(
                            errMsg,
                            configPath,
                            `projects/${projectName ?? '0'}/tasks/build/style/bundles/[${i}]/.out`
                        );
                    }

                    const outputFilePath = path.resolve(this.options.outDir, normalizePathToPOSIXStyle(trimedOut));
                    outDir = path.dirname(outputFilePath);
                    outputFileName = path.basename(outputFilePath);
                }
            } else {
                outputFileName = path.basename(entryFilePath).replace(styleFileTestRegExp, '.css');
                const outputFilePath = path.resolve(this.options.outDir, outputFileName);
                outDir = path.dirname(outputFilePath);
            }

            // sourceMap
            const sourceMap = bundle.sourceMap ?? styleOptions.sourceMap ?? true;

            // minify
            const minify = bundle.minify ?? styleOptions.minify ?? true;
            let cssnanoOptions: Record<string, unknown> | null = null;
            if (minify) {
                const cssnanoConfigFilePath = path.resolve(workspaceRoot, '.cssnanorc.config.json');
                if (await pathExists(cssnanoConfigFilePath)) {
                    cssnanoOptions = (await readJsonWithComments(cssnanoConfigFilePath)) as Record<string, unknown>;
                } else if (
                    this.options.packageJsonInfo?.packageJson?.cssnano &&
                    typeof this.options.packageJsonInfo.packageJson.cssnano === 'object'
                ) {
                    cssnanoOptions = { ...this.options.packageJsonInfo.packageJson.cssnano };
                }
            }

            const webpackConfig: Configuration = {
                devtool: sourceMap ? 'source-map' : false,
                entry: entryFilePath,
                output: {
                    path: outDir
                },
                context: projectRoot,
                module: {
                    rules: [
                        {
                            test: /\.js$/,
                            exclude: /node_modules/,
                            use: []
                        },
                        {
                            test: styleFileTestRegExp,
                            type: 'asset/resource',
                            // exclude: /node_modules/,
                            generator: {
                                filename: outputFileName
                            },
                            use: [
                                {
                                    loader: 'css-loader',
                                    options: {
                                        sourceMap
                                    }
                                },
                                {
                                    loader: 'postcss-loader',
                                    options: {
                                        sourceMap,
                                        postcssOptions: {
                                            plugins: [
                                                // 'postcss-preset-env'
                                                // Or
                                                postcssPresetEnv.default()
                                            ]
                                        }
                                    }
                                },
                                {
                                    loader: 'sass-loader',
                                    options: {
                                        sourceMap,

                                        // Prefer Dart Sass
                                        // implementation: require('sass'),

                                        // See https://github.com/webpack-contrib/sass-loader/issues/804
                                        webpackImporter: false,

                                        // "modern" API is experimental, so some features may not work
                                        // (known: built-in importer is not working and files with errors is not watching on initial run),
                                        // you can follow this https://github.com/webpack-contrib/sass-loader/issues/774
                                        // api: 'modern',
                                        sassOptions: {
                                            outputStyle: 'compressed'
                                            // includePaths: ["absolute/path/a", "absolute/path/b"],
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

            webpackConfigs.push(webpackConfig);
        }

        for (const webpackConfig of webpackConfigs) {
            await runWebpack(webpackConfig, this.logger);
        }

        return { files: [] };
    }
}

export function getStyleTaskRunner(
    buildTask: ParsedBuildTask,
    logger: Logger,
    logLevel: LogLevelString,
    dryRun = false
): StyleTaskRunner | null {
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
        dryRun,
        workspaceInfo: buildTask._workspaceInfo,
        packageJsonInfo: buildTask._packageJsonInfo,
        outDir: buildTask._outDir,
        logger,
        logLevel
    });

    return copyTaskRunner;
}
