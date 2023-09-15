import * as path from 'node:path';

import { Compiler, sources } from 'webpack';

import { WebpackCompilationError } from '../../../../../../exceptions/index.js';
import { LogLevelString, Logger, colors, normalizePathToPOSIXStyle } from '../../../../../../utils/index.js';

function formatSize(size: number): string {
    if (size < 1024) {
        return `${size.toLocaleString('en-US', { maximumFractionDigits: 2 })} bytes`;
    } else if (size < 1024 * 1024) {
        return `${(size / 1024).toLocaleString('en-US', { maximumFractionDigits: 2 })} KB`;
    } else {
        return `${(size / (1024 * 1024)).toLocaleString('en-US', { maximumFractionDigits: 2 })} MB`;
    }
}

export interface StyleWebpackPluginSuccessResult {
    readonly builtAssets: { path: string; size: number }[];
}

export interface StyleWebpackPluginOptions {
    readonly outDir: string;
    readonly logger: Logger;
    readonly logLevel: LogLevelString;
    readonly dryRun: boolean;
    readonly separateMinifyFile: boolean;
    readonly onSuccess: (result: StyleWebpackPluginSuccessResult) => void;
}

export class StyleWebpackPlugin {
    readonly name = 'style-webpack-plugin';

    private readonly logger: Logger;
    private readonly builtAssets: { path: string; size: number }[] = [];
    private startTime = Date.now();

    constructor(private readonly options: StyleWebpackPluginOptions) {
        this.logger = this.options.logger;
    }

    apply(compiler: Compiler): void {
        compiler.hooks.initialize.tap(this.name, () => {
            this.logger.group('\u25B7 style');
            this.startTime = Date.now();
        });

        compiler.hooks.compilation.tap(this.name, (compilation) => {
            compilation.hooks.processAssets.tap(
                {
                    name: this.name,
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_DERIVED
                },
                (assets) => {
                    if (!this.options.separateMinifyFile) {
                        return;
                    }

                    const minCssAssets: Record<string, sources.Source> = {};

                    for (const [pathname, source] of Object.entries(assets)) {
                        if (!/\.css$/i.test(pathname) || /\.min\.css$/i.test(pathname)) {
                            continue;
                        }

                        const asset = compilation.getAsset(pathname);

                        if (asset?.info.minimized ?? asset?.info.copied) {
                            continue;
                        }

                        const filename = pathname.replace(/\.css$/i, '.min.css');
                        minCssAssets[filename] = source;
                    }

                    for (const [pathname, source] of Object.entries(minCssAssets)) {
                        compilation.assets[pathname] = source;
                    }
                }
            );

            compilation.hooks.chunkAsset.tap(this.name, (chunk, filename) => {
                if (!filename.endsWith('.js')) {
                    return;
                }

                let hasCssFile = false;
                for (const file of chunk.files) {
                    if (file.endsWith('.css')) {
                        hasCssFile = true;
                        break;
                    }
                }

                if (!hasCssFile) {
                    return;
                }

                let cssOnly = false;
                const entryModules = compilation.chunkGraph.getChunkEntryModulesIterable(chunk);
                for (const module of entryModules) {
                    cssOnly = module.dependencies.every(
                        (dependency: {}) => dependency.constructor.name === 'CssDependency'
                    );

                    if (!cssOnly) {
                        break;
                    }
                }

                if (cssOnly) {
                    chunk.files.delete(filename);
                    compilation.deleteAsset(filename);
                }
            });
        });

        compiler.hooks.shouldEmit.tap(this.name, (compilation) => {
            if (compilation.getStats().hasErrors()) {
                return;
            }

            for (const [assetName, source] of Object.entries(compilation.assets)) {
                const assetPath = compilation.getAssetPath(assetName, { hash: compilation.hash });
                const assetPathAbs = path.resolve(compilation.outputOptions.path ?? this.options.outDir, assetPath);
                const assetSize = source.size();

                this.logger.info(`Built: ${assetPath}, size: ${formatSize(assetSize)}`);

                this.builtAssets.push({
                    path: assetPathAbs,
                    size: assetSize
                });
            }

            if (this.options.dryRun) {
                this.logger.info('Emiting is not performed because the dryRun parameter is passed.');
            } else {
                this.logger.info('Emiting...');
            }

            return !this.options.dryRun;
        });

        compiler.hooks.assetEmitted.tap(this.name, (_1, { targetPath }) => {
            this.logger.debug(`${targetPath} emitted.`);
        });

        compiler.hooks.done.tap(this.name, (stats) => {
            if (stats) {
                if (stats.hasErrors()) {
                    let errorMessage = colors.lightRed('Running style task failed with errors:') + '\n';

                    if (this.options.logLevel === 'debug') {
                        errorMessage += stats.toString('errors-only');
                    } else {
                        const errors = stats.toJson('errors-only').errors ?? [];
                        const errorLines: string[] = [];
                        const moduleBuildFailedRegExp = /Module\sbuild\sfailed\s\(from\s\.\/node_modules\/.*\):/;
                        const atNodeModuleRegExp = /^(at|in|from)\s.*node_modules[\\/]/;
                        const errPrefixRegExp = /^(\w*Error:?$)|(\w*[\s\w]*\s?[:]?\s?Error:?\s)/i;
                        const locRegExp = /^\(([1-9][0-9]*:[1-9][0-9]*)\)\s?/;

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
                            formattedLine += colors.lightCyan(normalizePathToPOSIXStyle(errorFilePath));

                            const formatedSubLines: string[] = [];
                            let detectedLoc: string | null = null;
                            for (let subLine of err.message.split(/[\r\n]/)) {
                                subLine = subLine.trim();
                                if (!subLine) {
                                    continue;
                                }

                                if (moduleBuildFailedRegExp.test(subLine)) {
                                    continue;
                                }

                                if (!err.loc && !detectedLoc && formatedSubLines.length < 2) {
                                    const locMatch = subLine.match(locRegExp);
                                    if (locMatch?.length === 2 && locMatch[1]) {
                                        detectedLoc = locMatch[1];
                                    }
                                }

                                if (!formatedSubLines.length) {
                                    const errMatch = subLine.match(errPrefixRegExp);
                                    if (errMatch?.length) {
                                        let errPrefix = errMatch[0].replace(/\s?:\s?/, ' ').trim();
                                        if (!errPrefix.endsWith(':')) {
                                            errPrefix += ':';
                                        }
                                        if (errPrefix.split(' ').length > 1) {
                                            errPrefix = errPrefix[0] + errPrefix.substring(1).toLowerCase();
                                        }
                                        subLine =
                                            colors.lightRed(errPrefix) + ' ' + subLine.replace(errPrefixRegExp, '');
                                        subLine = subLine.trim();
                                    }
                                } else if (atNodeModuleRegExp.test(subLine)) {
                                    break;
                                }

                                if (!formatedSubLines.includes(subLine)) {
                                    formatedSubLines.push(subLine);
                                } else {
                                    break;
                                }
                            }

                            const loc = err.loc ?? detectedLoc;
                            if (loc) {
                                formattedLine += colors.lightYellow(':' + loc);
                            }

                            formattedLine += ' ';

                            formattedLine += formatedSubLines.join(' ');
                            if (!errorLines.includes(formattedLine.trim())) {
                                errorLines.push(formattedLine.trim());
                            }
                        }

                        errorMessage += errorLines.join('\n');
                    }

                    throw new WebpackCompilationError(errorMessage);
                }

                if (this.options.logLevel === 'debug') {
                    const msg = stats.toString();
                    if (msg?.trim()) {
                        this.logger.group(colors.lightMagenta('Webpack stats start'));
                        this.logger.debug(msg);
                        this.logger.groupEnd();
                        this.logger.debug(colors.lightMagenta('Webpack stats end'));
                    }
                } else {
                    if (stats.hasWarnings()) {
                        let msg = stats.toString('errors-warnings').trim();
                        const warningPrefixRegExp = /^(Warn(ing)?\s?:?\s*)/i;
                        if (warningPrefixRegExp.test(msg)) {
                            msg = msg.replace(warningPrefixRegExp, '').trim();
                        }
                        this.logger.warn(msg);
                    }
                }
            }

            const msgSuffix = this.options.dryRun ? 'built' : 'emitted';
            this.logger.info(`Total ${this.builtAssets.length} files are ${msgSuffix}.`);
            this.logger.groupEnd();
            this.logger.info(
                `${colors.lightGreen('\u25B6')} style [${colors.lightGreen(`${Date.now() - this.startTime}ms`)}]`
            );

            if (this.options.onSuccess != null) {
                this.options.onSuccess({
                    builtAssets: this.builtAssets
                });
            }
        });
    }
}
