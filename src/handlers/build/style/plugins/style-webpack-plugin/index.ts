import { Compiler, sources } from 'webpack';

import { WebpackCompilationError } from '../../../../../exceptions/index.js';
import { LogLevelString, Logger, colors, normalizePathToPOSIXStyle } from '../../../../../utils/index.js';

function formatSize(size: number): string {
    if (size < 1024) {
        return `${size.toLocaleString('en-US', { maximumFractionDigits: 2 })} bytes`;
    } else if (size < 1024 * 1024) {
        return `${(size / 1024).toLocaleString('en-US', { maximumFractionDigits: 2 })} KB`;
    } else {
        return `${(size / (1024 * 1024)).toLocaleString('en-US', { maximumFractionDigits: 2 })} MB`;
    }
}

export interface StyleWebpackPluginOptions {
    readonly outDir: string;
    readonly logger: Logger;
    readonly logLevel: LogLevelString;
    readonly dryRun: boolean;
    readonly separateMinifyFile: boolean;
    readonly sourceMapInMinifyFile: boolean;
    readonly bannerText: string | null;
}

export class StyleWebpackPlugin {
    readonly name = 'style-webpack-plugin';

    private readonly logger: Logger;
    private readonly banner: () => string;

    constructor(private readonly options: StyleWebpackPluginOptions) {
        this.logger = this.options.logger;
        this.banner = () => this.options.bannerText ?? '';
    }

    apply(compiler: Compiler): void {
        const banner = this.banner;
        const bannerCache = new WeakMap<sources.Source>();

        compiler.hooks.compilation.tap(this.name, (compilation) => {
            compilation.hooks.processAssets.tap(
                {
                    name: this.name,
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS
                },
                (assets) => {
                    // Add banner
                    if (this.options.bannerText) {
                        for (const chunk of compilation.chunks) {
                            // entryOnly
                            if (!chunk.canBeInitial()) {
                                continue;
                            }

                            for (const file of chunk.files) {
                                const comment = compilation.getPath(banner, {
                                    chunk,
                                    filename: file
                                });

                                compilation.updateAsset(file, (old) => {
                                    const cached = bannerCache.get(old) as {
                                        source: sources.ConcatSource;
                                        comment: string;
                                    };

                                    if (!cached || cached.comment !== comment) {
                                        const source = new compiler.webpack.sources.ConcatSource(comment, '\n', old);

                                        bannerCache.set(old, { source, comment });

                                        return source;
                                    }

                                    return cached.source;
                                });
                            }
                        }
                    }

                    // Separate minify file
                    if (this.options.separateMinifyFile) {
                        const minCssAssets: Record<string, sources.Source> = {};

                        for (const [pathname, source] of Object.entries(assets)) {
                            if (!/\.css$/i.test(pathname) || /\.min\.css$/i.test(pathname)) {
                                continue;
                            }

                            const filename = pathname.replace(/\.css$/i, '.min.css');
                            minCssAssets[filename] = source;
                        }

                        for (const [pathname, source] of Object.entries(minCssAssets)) {
                            compilation.assets[pathname] = this.options.sourceMapInMinifyFile
                                ? source
                                : new compiler.webpack.sources.RawSource(source.source());
                        }
                    }
                }
            );

            // Supress .js output
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

        compiler.hooks.afterCompile.tap(this.name, (compilation) => {
            if (compilation.getStats().hasErrors()) {
                return;
            }

            for (const [assetName, source] of Object.entries(compilation.assets)) {
                const assetPath = compilation.getAssetPath(assetName, { hash: compilation.hash });
                const assetSize = source.size();

                this.logger.info(`Built: ${assetPath}, size: ${formatSize(assetSize)}`);
            }
        });

        compiler.hooks.shouldEmit.tap(this.name, (compilation) => {
            if (compilation.getStats().hasErrors()) {
                return false;
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
            if (!stats) {
                return;
            }

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
                                    subLine = colors.lightRed(errPrefix) + ' ' + subLine.replace(errPrefixRegExp, '');
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

            const builtAssetsCount = Object.keys(stats.compilation.assets).length;
            const msgSuffix = this.options.dryRun ? 'built' : 'emitted';
            this.logger.info(`Total ${builtAssetsCount} files are ${msgSuffix}.`);

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
        });
    }
}