/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import * as path from 'node:path';

import { Compiler, StatsAsset, sources } from 'webpack';

import {
    LogLevelStrings,
    LoggerBase,
    colors,
    formatSizeInBytes,
    normalizePathToPOSIXStyle
} from '../../../../../../../../utils/index.mjs';

import { CompilationError } from '../../../../../../../exceptions/index.mjs';

import { ParsedBannerOptions } from '../../../../../../parsed-banner-options.mjs';

export interface ScriptWebpackPluginOptions {
    readonly outDir: string;
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings | undefined;
    readonly dryRun: boolean | undefined;
    readonly separateMinifyFile: boolean;
    readonly sourceMapInMinifyFile: boolean;
    readonly banner: ParsedBannerOptions | null | undefined;
    readonly footer: ParsedBannerOptions | null | undefined;
}

export class ScriptWebpackPlugin {
    readonly name = 'script-webpack-plugin';

    private readonly logger: LoggerBase;
    private readonly bannerText: () => string;
    private readonly footerText: () => string;

    constructor(private readonly options: ScriptWebpackPluginOptions) {
        this.logger = this.options.logger;
        this.bannerText = () => this.options.banner?.text ?? '';
        this.footerText = () => this.options.footer?.text ?? '';
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
                    // Add banner
                    if (this.options.banner != null || this.options.footer != null) {
                        for (const chunk of compilation.chunks) {
                            // TODO: entryOnly?
                            if (!chunk.canBeInitial()) {
                                continue;
                            }

                            for (const file of chunk.files) {
                                const commentBanner = this.options.banner?.text
                                    ? compilation.getPath(bannerText, {
                                          chunk,
                                          filename: file
                                      })
                                    : '';

                                const commentFooter = this.options.footer?.text
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
                            if (!/\.js$/i.test(pathname) || /\.min\.js$/i.test(pathname)) {
                                continue;
                            }

                            const filename = pathname.replace(/\.js$/i, '.min.mjs');
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

            // If emitDeclarationOnly then supress .js output
            // compilation.hooks.chunkAsset.tap(this.name, (chunk, filename) => {
            //     if (!filename.endsWith('.mjs') || !this.options.emitDeclarationOnly) {
            //         return;
            //     }

            //     chunk.files.delete(filename);
            //     compilation.deleteAsset(filename);
            // });
        });

        compiler.hooks.shouldEmit.tap(this.name, (compilation) => {
            // if (this.options.emitDeclarationOnly) {
            //     compilation.errors = compilation.errors.filter((err) => {
            //         !err.message.includes('TypeScript emitted no output for ');
            //     });
            // }

            if (compilation.errors.length > 0) {
                return false;
            }

            return !this.options.dryRun;
        });

        compiler.hooks.done.tap(this.name, (stats) => {
            if (!stats) {
                return;
            }

            if (stats.hasErrors()) {
                let errorMessage = colors.lightRed('Running webpack script bundling task failed with errors:') + '\n';

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

            const statsJson = stats.toJson({
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

            const outputPath = statsJson.outputPath ?? this.options.outDir;
            this.displayBuiltAssets(statsJson.assets ?? [], outputPath);

            if (stats.hasWarnings()) {
                let msg = stats.toString('errors-warnings').trim();
                const warningPrefixRegExp = /^(Warn(ing)?\s?:?\s*)/i;
                if (warningPrefixRegExp.test(msg)) {
                    msg = msg.replace(warningPrefixRegExp, '').trim();
                }
                this.logger.warn(msg);
            }
        });
    }

    private displayBuiltAssets(assets: StatsAsset[], outputPath: string): void {
        for (const asset of assets) {
            const outputFilePath = path.resolve(outputPath, asset.name);
            const outputFilePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), outputFilePath));

            const prefix = asset.emitted ? 'Emitted: ' : 'Built: ';
            const suffix = ` - ${formatSizeInBytes(asset.size)}`;
            this.logger.info(`${prefix}${outputFilePathRel}${suffix}`);

            if (asset.related && Array.isArray(asset.related)) {
                this.displayBuiltAssets(asset.related, outputPath);
            }
        }
    }
}
