/* eslint-disable import/default */
/* eslint-disable import/no-named-as-default-member */
import * as path from 'node:path';

import ts from 'typescript';
import webpackDefault, { Configuration, StatsAsset } from 'webpack';

import { LoggerBase, normalizePathToPOSIXStyle } from '../../../../../../utils/index.js';

import { CompileOptions } from '../../compile-options.js';
import { CompileResult } from '../../compile-result.js';

import { ScriptWebpackPlugin } from './plugins/script-webpack-plugin/index.js';

function mapToResultAssets(
    assets: StatsAsset[],
    outputPath: string,
    builtAssets: { path: string; size: number }[]
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

            const result: CompileResult = {
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
    const targets: string[] = [options.scriptTarget.toLowerCase()];
    if (options.environmentTargets) {
        for (const target of options.environmentTargets) {
            targets.push(target);
        }
    }

    return targets;
}

export default async function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    const outDir = path.dirname(options.outFilePath);
    const libraryType = getWebpackLibraryType(options);

    const webpackConfig: Configuration = {
        devtool: options.sourceMap
            ? options.tsConfigInfo?.compilerOptions.inlineSourceMap ??
              options.tsConfigInfo?.compilerOptions.inlineSourceMap
                ? 'inline-source-map'
                : 'source-map'
            : false,
        mode: 'production',
        entry: options.entryFilePath,
        output: {
            path: outDir,
            filename: path.basename(options.outFilePath),
            iife: options.moduleFormat === 'iife' ? true : undefined,
            module: libraryType === 'module' ? true : undefined,
            library: {
                type: libraryType,
                name: options.globalName,
                umdNamedDefine: options.globalName && libraryType === 'umd' ? true : undefined
                // export: 'default'
            }
        },
        target: getWebpackTargets(options),
        plugins: [
            new ScriptWebpackPlugin({
                outDir,
                logger,
                logLevel: options.logLevel,
                dryRun: options.dryRun,
                // TODO:
                separateMinifyFile: false,
                // TODO:
                sourceMapInMinifyFile: false,
                bannerText: options.bannerText
            })
        ],
        module: {
            rules: [
                {
                    test: /\.(mts|cts|tsx?|mjs|cjs|jsx?)$/i,
                    use: 'ts-loader',
                    exclude: /node_modules/
                }
            ]
        },
        resolve: {
            extensions: ['.mts', '.cts', '.tsx', '.ts', '.mjs', '.cjs', '.jsx', '.js']
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

    const entryFilePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), options.entryFilePath));
    logger.info(
        `Bundling with webpack, entry: ${entryFilePathRel}, module format: ${options.moduleFormat}, script target: ${options.scriptTarget}...`
    );

    const result = await runWebpack(webpackConfig, outDir);

    return result;
}
