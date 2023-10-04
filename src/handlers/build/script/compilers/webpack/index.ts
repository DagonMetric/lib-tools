/* eslint-disable import/default */
/* eslint-disable import/no-named-as-default-member */
import { createRequire } from 'node:module';
import * as path from 'node:path';

import ts from 'typescript';
import webpackDefault, { Configuration, StatsAsset } from 'webpack';

import { CompilationError } from '../../../../../exceptions/index.js';
import { LoggerBase, colors, normalizePathToPOSIXStyle } from '../../../../../utils/index.js';

import { CompileAsset, CompileOptions, CompileResult } from '../../interfaces/index.js';

import { ScriptWebpackPlugin } from './plugins/script-webpack-plugin/index.js';

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
    const targets: string[] = [options.scriptTarget.toLowerCase()];
    if (options.environmentTargets) {
        for (const target of options.environmentTargets) {
            targets.push(target);
        }
    }

    return targets;
}

function getTsCompilerOptions(options: CompileOptions): ts.CompilerOptions {
    const configFileCompilerOptions = options.tsConfigInfo?.compilerOptions ?? {};

    const compilerOptions: ts.CompilerOptions = {};

    compilerOptions.outDir = path.dirname(options.outFilePath);
    compilerOptions.rootDir = path.dirname(options.entryFilePath);

    if (options.scriptTarget != null) {
        compilerOptions.target = ts.ScriptTarget[options.scriptTarget];
    }

    if (/\.(jsx|mjs|cjs|js)$/i.test(options.entryFilePath)) {
        compilerOptions.allowJs = true;
    }

    if (options.moduleFormat === 'cjs') {
        if (
            configFileCompilerOptions.module == null ||
            (configFileCompilerOptions.module !== ts.ModuleKind.CommonJS &&
                configFileCompilerOptions.module !== ts.ModuleKind.Node16 &&
                configFileCompilerOptions.module !== ts.ModuleKind.NodeNext)
        ) {
            if ((compilerOptions.target as number) > 8) {
                // TODO: To review
                compilerOptions.module = ts.ModuleKind.NodeNext;
            } else {
                // TODO: To review
                compilerOptions.module = ts.ModuleKind.CommonJS;
            }
        }
    } else if (options.moduleFormat === 'esm') {
        if (
            configFileCompilerOptions.module == null ||
            configFileCompilerOptions.module === ts.ModuleKind.None ||
            configFileCompilerOptions.module === ts.ModuleKind.AMD ||
            configFileCompilerOptions.module === ts.ModuleKind.CommonJS ||
            configFileCompilerOptions.module === ts.ModuleKind.System ||
            configFileCompilerOptions.module === ts.ModuleKind.UMD
        ) {
            // TODO: To review
            compilerOptions.module = ts.ModuleKind.ESNext;
        }
    } else if (options.moduleFormat === 'iife') {
        if (
            configFileCompilerOptions.module !== ts.ModuleKind.System &&
            configFileCompilerOptions.module !== ts.ModuleKind.UMD
        ) {
            compilerOptions.module = ts.ModuleKind.UMD;
        }

        // TODO: To review
        if (configFileCompilerOptions.moduleResolution !== ts.ModuleResolutionKind.Node10) {
            compilerOptions.moduleResolution = ts.ModuleResolutionKind.Node10;
        }
    }

    if (options.declaration != null) {
        compilerOptions.declaration = options.declaration;
    } else if (configFileCompilerOptions.declaration != null) {
        compilerOptions.declaration = configFileCompilerOptions.declaration;
    }

    if (options.sourceMap) {
        compilerOptions.sourceRoot = path.dirname(options.entryFilePath);
        compilerOptions.sourceMap = true;
        compilerOptions.inlineSourceMap = false;
        compilerOptions.inlineSources = true;
    } else {
        compilerOptions.sourceMap = false;
        compilerOptions.inlineSourceMap = false;
        compilerOptions.inlineSources = false;

        if (!configFileCompilerOptions.sourceRoot != null) {
            compilerOptions.sourceRoot = '';
        }
    }

    return compilerOptions;
}

export default async function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    if (options.emitDeclarationOnly ?? options.tsConfigInfo?.compilerOptions.emitDeclarationOnly) {
        throw new CompilationError(
            `${colors.lightRed(
                'Error:'
            )} Typescript compiler options 'emitDeclarationOnly' is not supported in webpack compiler tool.`
        );
    }

    if (options.tsConfigInfo?.compilerOptions.noEmit) {
        throw new CompilationError(
            `${colors.lightRed(
                'Error:'
            )} Typescript compiler options 'noEmit' is not supported in webpack compiler tool.`
        );
    }

    const outDir = path.dirname(options.outFilePath);
    const libraryType = getWebpackLibraryType(options);
    const tsCompilerOptions = getTsCompilerOptions(options);

    const webpackConfig: Configuration = {
        devtool: options.sourceMap ? 'source-map' : false,
        mode: 'production',
        entry: options.entryFilePath,
        output: {
            path: outDir,
            filename: path.basename(options.outFilePath),
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
                    use: [
                        {
                            loader: require.resolve('ts-loader'),
                            options: {
                                configFile: options.tsConfigInfo?.configPath,
                                compilerOptions: tsCompilerOptions
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

    const entryFilePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), options.entryFilePath));
    logger.info(`With entry file: ${entryFilePathRel}`);
    if (options.tsConfigInfo?.configPath) {
        const tsConfigPathRel = normalizePathToPOSIXStyle(
            path.relative(process.cwd(), options.tsConfigInfo.configPath)
        );

        logger.info(`With tsconfig file: ${tsConfigPathRel}`);
    }

    logger.info(`With script target: '${options.scriptTarget}', library type: '${libraryType}'`);

    const result = await runWebpack(webpackConfig, outDir);

    return result;
}
