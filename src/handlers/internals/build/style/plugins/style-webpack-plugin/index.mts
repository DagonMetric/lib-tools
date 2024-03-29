/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { Compiler, sources } from 'webpack';

import {
    LogLevelStrings,
    LoggerBase,
    colors,
    formatSizeInBytes,
    normalizePathToPOSIXStyle
} from '../../../../../../utils/index.mjs';

import { CompilationError } from '../../../../../exceptions/index.mjs';

export interface StyleWebpackPluginOptions {
    readonly outDir: string;
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings;
    readonly dryRun: boolean | undefined;
    readonly separateMinifyFile: boolean;
    readonly sourceMapInMinifyFile: boolean;
    readonly banner: string | null | undefined;
    readonly footer: string | null | undefined;
}

export class StyleWebpackPlugin {
    readonly name = 'style-webpack-plugin';

    private readonly logger: LoggerBase;
    private readonly bannerText: () => string;
    private readonly footerText: () => string;

    constructor(private readonly options: StyleWebpackPluginOptions) {
        this.logger = this.options.logger;
        this.bannerText = () => this.options.banner ?? '';
        this.footerText = () => this.options.footer ?? '';
    }

    apply(compiler: Compiler): void {
        const bannerText = this.bannerText;
        const footerText = this.footerText;

        const bannerAndFooterCache = new WeakMap<sources.Source>();

        compiler.hooks.compilation.tap(this.name, (compilation) => {
            compilation.hooks.processAssets.tap(
                {
                    name: this.name,
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS
                },
                (assets) => {
                    // Add banner or footer
                    if (this.options.banner != null || this.options.footer != null) {
                        for (const chunk of compilation.chunks) {
                            // TODO: entryOnly
                            if (!chunk.canBeInitial()) {
                                continue;
                            }

                            for (const file of chunk.files) {
                                const commentBanner = this.options.banner
                                    ? compilation.getPath(bannerText, {
                                          chunk,
                                          filename: file
                                      })
                                    : '';

                                const commentFooter = this.options.footer
                                    ? compilation.getPath(footerText, {
                                          chunk,
                                          filename: file
                                      })
                                    : '';

                                compilation.updateAsset(file, (old) => {
                                    const cached = bannerAndFooterCache.get(old) as {
                                        source: sources.ConcatSource;
                                        commentBanner: string;
                                        commentfooter: string;
                                    };

                                    if (
                                        !cached ||
                                        cached.commentBanner !== commentBanner ||
                                        cached.commentfooter !== commentFooter
                                    ) {
                                        let source: sources.Source;

                                        if (commentBanner && commentFooter) {
                                            source = new compiler.webpack.sources.ConcatSource(
                                                commentBanner,
                                                '\n',
                                                old,
                                                '\n',
                                                commentFooter
                                            );
                                        } else if (commentBanner) {
                                            source = new compiler.webpack.sources.ConcatSource(
                                                commentBanner,
                                                '\n',
                                                old
                                            );
                                        } else {
                                            source = new compiler.webpack.sources.ConcatSource(
                                                old,
                                                '\n',
                                                commentFooter
                                            );
                                        }

                                        bannerAndFooterCache.set(old, { source, commentBanner, commentFooter });

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
                if (!filename.endsWith('.mjs')) {
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

                this.logger.info(`Built: ${assetPath}, size: ${formatSizeInBytes(assetSize)}`);
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
                        let formattedLine = '';
                        let errorFilePath: string | null = null;

                        if (err.moduleName) {
                            const moduleIdentifiers = err.moduleName.split('!');
                            if (moduleIdentifiers.length) {
                                errorFilePath = moduleIdentifiers[moduleIdentifiers.length - 1];
                                formattedLine += colors.lightCyan(normalizePathToPOSIXStyle(errorFilePath));
                            }
                        }

                        const formatedSubLines: string[] = [];
                        let detectedLoc: string | null = null;
                        const subLines = err.message.split(/[\r\n]/);
                        for (let i = 0; i < subLines.length; i++) {
                            let subLine = subLines[i].trim();
                            if (!subLine) {
                                continue;
                            }

                            if (
                                i === 0 &&
                                subLines.length > 1 &&
                                errPrefixRegExp.test(subLines[i + 1].trim()) &&
                                subLine.endsWith(' from Css Minimizer plugin')
                            ) {
                                continue;
                            }

                            if (moduleBuildFailedRegExp.test(subLine)) {
                                continue;
                            }

                            if (errorFilePath && !err.loc && !detectedLoc && formatedSubLines.length < 2) {
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

                        if (errorFilePath) {
                            const loc = err.loc ?? detectedLoc;
                            if (loc) {
                                formattedLine += colors.lightYellow(':' + loc);
                            }
                        }

                        formattedLine += ' ';

                        formattedLine += formatedSubLines.join(' ');
                        if (!errorLines.includes(formattedLine.trim())) {
                            errorLines.push(formattedLine.trim());
                        }
                    }

                    if (errorLines.length) {
                        errorMessage += errorLines.join('\n');
                    } else {
                        errorMessage += stats.toString('errors-only');
                    }
                }

                throw new CompilationError(errorMessage);
            }

            const builtAssetsCount = Object.keys(stats.compilation.assets).length;
            const msgSuffix = this.options.dryRun ? 'built' : 'emitted';
            const fileverb = builtAssetsCount > 1 ? 'files are' : 'file is';
            this.logger.info(`Total ${builtAssetsCount} ${fileverb} ${msgSuffix}.`);

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
