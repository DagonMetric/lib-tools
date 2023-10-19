/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { createRequire } from 'node:module';
import * as path from 'node:path';

import webpackDefault, { Configuration, StatsAsset } from 'webpack';

import { LoggerBase, colors, normalizePathToPOSIXStyle } from '../../../../../../utils/index.mjs';

import { InvalidConfigError } from '../../../../../exceptions/index.mjs';

import { CompileAsset, CompileOptions, CompileResult } from '../compile-interfaces.mjs';
import { ts } from '../tsproxy.mjs';

import { ScriptWebpackPlugin } from './plugins/script-webpack-plugin/index.mjs';

const require = createRequire(process.cwd() + '/');

function mapToResultAssets(
    assets: StatsAsset[],
    outputPath: string,
    builtAssets: { path: string; size?: number }[]
): void {
    for (const asset of assets) {
        builtAssets.push({
            path: path.resolve(outputPath, asset.name),
            size: asset.size
        });

        if (asset.related && Array.isArray(asset.related)) {
            mapToResultAssets(asset.related, outputPath, builtAssets);
        }
    }
}

async function runWebpack(webpackConfig: Configuration, outDir: string): Promise<CompileResult> {
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

            const duration = statsJson?.time ?? 0;
            const builtAssets: CompileAsset[] = [];

            mapToResultAssets(statsJson?.assets ?? [], outputPath, builtAssets);

            webpackCompiler.close(() => {
                resolve({
                    builtAssets: [],
                    time: duration
                });
            });
        });
    });
}

function getWebpackLibraryType(options: CompileOptions): string {
    if (options.moduleFormat === 'esm') {
        return 'module';
    } else if (options.moduleFormat === 'cjs') {
        // commonjs, commonjs2, commonjs-static
        return 'commonjs-static';
    } else {
        if (options.tsConfigInfo?.compilerOptions.module === ts.ModuleKind.AMD) {
            return 'amd';
        } else if (options.tsConfigInfo?.compilerOptions.module === ts.ModuleKind.System) {
            return 'system';
        } else if (options.tsConfigInfo?.compilerOptions.module === ts.ModuleKind.UMD) {
            return 'umd';
        }

        // TODO:
        // var, this, window, assign, assign-properties, global
        return 'var';
    }
}

function getWebpackTargets(options: CompileOptions): string[] {
    const targets: string[] = [];

    if (options.scriptTarget) {
        targets.push(options.scriptTarget.toLowerCase());
    }

    if (options.environmentTargets) {
        for (const target of options.environmentTargets) {
            if (!targets.includes(target)) {
                targets.push(target);
            }
        }
    }

    return targets;
}

export default async function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    if (options.tsConfigInfo?.compilerOptions.emitDeclarationOnly === true) {
        throw new InvalidConfigError(
            `Typescript compiler options 'emitDeclarationOnly' is not supported in webpack compiler tool.`,
            null,
            null
        );
    }

    if (options.tsConfigInfo?.compilerOptions.noEmit) {
        throw new InvalidConfigError(
            `Typescript compiler options 'noEmit' is not supported in webpack compiler tool.`,
            null,
            null
        );
    }

    const libraryType = getWebpackLibraryType(options);

    const webpackConfig: Configuration = {
        devtool: options.sourceMap ? 'source-map' : false,
        mode: 'production',
        entry: options.entryPoints,
        output: {
            path: options.outDir,
            iife: options.moduleFormat === 'iife' ? true : undefined,
            module: libraryType === 'module' ? true : undefined,
            // enabledLibraryTypes: ['module'],
            // enabledWasmLoadingTypes: ['fetch'],
            // environment: {
            // },
            library: {
                type: libraryType,
                name: options.globalName,
                umdNamedDefine: options.globalName && libraryType === 'umd' ? true : undefined
                // export: 'default'
            }
        },
        target: getWebpackTargets(options),
        plugins: [
            // new TsconfigPathsPlugin({/* options: see below */})
            new ScriptWebpackPlugin({
                outDir: options.outDir,
                logger,
                logLevel: options.logLevel,
                dryRun: options.dryRun,
                // TODO:
                separateMinifyFile: false,
                // TODO:
                sourceMapInMinifyFile: false,
                banner: options.banner,
                footer: options.footer
            })
        ],
        module: {
            rules: [
                {
                    test: /\.(mts|cts|tsx?|mjs|cjs|jsx?)$/i,
                    use: [
                        {
                            loader: require.resolve('ts-loader'),
                            options: {
                                configFile: options.tsConfigInfo?.configPath,
                                compilerOptions: options.tsConfigInfo?.compilerOptions
                            }
                        }
                    ]
                }
            ]
        },
        resolve: {
            // Add `.ts` and `.tsx` as a resolvable extension.
            extensions: ['.ts', '.tsx', '.js'],
            // Add support for TypeScripts fully qualified ESM imports.
            extensionAlias: {
                '.js': ['.js', '.ts'],
                '.cjs': ['.cjs', '.cts'],
                '.mjs': ['.mjs', '.mts']
            }
        },
        externals: { ...options.globals },
        optimization: {
            minimize: options.minify
        }
    };

    if (libraryType === 'module' && webpackConfig.output?.module === true) {
        webpackConfig.experiments = webpackConfig.experiments ?? {};
        webpackConfig.experiments.outputModule = true;
    }

    const dryRunSuffix = options.dryRun ? ' [dry run]' : '';
    logger.info(`Bundling with ${colors.lightMagenta('webpack')}...${dryRunSuffix}`);

    if (options.tsConfigInfo?.configPath) {
        logger.info(
            `With tsconfig file: ${normalizePathToPOSIXStyle(
                path.relative(process.cwd(), options.tsConfigInfo.configPath)
            )}`
        );
    }

    if (libraryType) {
        logger.info(`With library type: ${libraryType}`);
    }

    const result = await runWebpack(webpackConfig, options.outDir);

    return result;
}
