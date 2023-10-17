/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import { InputOptions, InputPluginOption, ModuleFormat, OutputOptions, RollupBuild, RollupError, rollup } from 'rollup';
import { CompilerOptions } from 'typescript';

import {
    LoggerBase,
    colors,
    dashToCamelCase,
    formatSizeInBytes,
    isSamePath,
    normalizePathToPOSIXStyle,
    pathExists
} from '../../../../../../utils/index.mjs';

import { CompilationError } from '../../../../../exceptions/index.mjs';

import { CompileAsset, CompileOptions, CompileResult } from '../interfaces.mjs';
import { ts } from '../tsproxy.mjs';

const require = createRequire(process.cwd() + '/');

const rollupNodeResolve =
    require('@rollup/plugin-node-resolve') as typeof import('@rollup/plugin-node-resolve').default;
const rollupJson = require('@rollup/plugin-json') as typeof import('@rollup/plugin-json').default;

// const rollupTypescript = require('@rollup/plugin-typescript') as typeof import('@rollup/plugin-typescript').default;
const rollupTypescript = require('rollup-plugin-typescript2') as typeof import('rollup-plugin-typescript2').default;

const rollupCommonjs = require('@rollup/plugin-commonjs') as typeof import('@rollup/plugin-commonjs').default;
const rollupReplace = require('@rollup/plugin-replace') as typeof import('@rollup/plugin-replace').default;

type ScriptTargetStrings = keyof typeof ts.ScriptTarget;
type ModuleKindStrings = keyof typeof ts.ModuleKind;
type ModuleResolutionKindStrings = keyof typeof ts.ModuleResolutionKind;

interface JsonTsCompilerOptions
    extends Pick<
        CompilerOptions,
        | 'outDir'
        | 'rootDir'
        | 'allowJs'
        | 'declaration'
        | 'sourceMap'
        | 'inlineSourceMap'
        | 'inlineSources'
        | 'sourceRoot'
        | 'preserveSymlinks'
    > {
    target?: ScriptTargetStrings;
    module?: ModuleKindStrings;
    moduleResolution?: ModuleResolutionKindStrings;
}

function getTsCompilerOptionsOverride(options: CompileOptions): JsonTsCompilerOptions {
    const configFileCompilerOptions = options.tsConfigInfo?.compilerOptions ?? {};

    const overrideCompilerOptions: JsonTsCompilerOptions = {};

    overrideCompilerOptions.outDir = options.outDir;

    if (options.entryFilePath) {
        overrideCompilerOptions.rootDir = path.dirname(options.entryFilePath);

        if (/\.(jsx|mjs|cjs|js)$/i.test(options.entryFilePath)) {
            overrideCompilerOptions.allowJs = true;
        }
    }

    let scriptTarget = options.scriptTarget ? ts.ScriptTarget[options.scriptTarget] : configFileCompilerOptions.target;

    if (options.scriptTarget) {
        scriptTarget = ts.ScriptTarget[options.scriptTarget];

        const targetStr = ts.ScriptTarget[scriptTarget] as ScriptTargetStrings;
        if (targetStr === 'Latest') {
            // 'latest' is currently incompatible with Rollup typescript
            overrideCompilerOptions.target = 'ESNext';
        } else {
            overrideCompilerOptions.target = targetStr;
        }
    } else if (scriptTarget === ts.ScriptTarget.Latest) {
        // 'latest' is currently incompatible with Rollup typescript
        overrideCompilerOptions.target = 'ESNext';
    }

    if (
        configFileCompilerOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext ||
        configFileCompilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16
    ) {
        // TODO: Warn instead
        //
        // 'NodeNext' is currently incompatible with Rollup typescript
        overrideCompilerOptions.moduleResolution = ts.ModuleResolutionKind[
            ts.ModuleResolutionKind.Bundler
        ] as ModuleResolutionKindStrings;
    }

    if (options.moduleFormat) {
        if (options.moduleFormat === 'cjs') {
            if (
                configFileCompilerOptions.module == null ||
                (configFileCompilerOptions.module !== ts.ModuleKind.CommonJS &&
                    configFileCompilerOptions.module !== ts.ModuleKind.Node16 &&
                    configFileCompilerOptions.module !== ts.ModuleKind.NodeNext)
            ) {
                if (configFileCompilerOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext) {
                    // TODO: 'NodeNext' is currently incompatible with Rollup
                    overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.NodeNext] as ModuleKindStrings;
                } else if (configFileCompilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16) {
                    // TODO: 'Node16' is currently incompatible with Rollup
                    overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.Node16] as ModuleKindStrings;
                } else {
                    overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.CommonJS] as ModuleKindStrings;
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
                if (configFileCompilerOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext) {
                    // 'NodeNext' is currently incompatible with Rollup
                    overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.NodeNext] as ModuleKindStrings;
                } else if (configFileCompilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16) {
                    // 'Node16' is currently incompatible with Rollup
                    overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.Node16] as ModuleKindStrings;
                } else if (scriptTarget && scriptTarget > ts.ScriptTarget.ES2022) {
                    overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.ESNext] as ModuleKindStrings;
                } else if (scriptTarget && scriptTarget > ts.ScriptTarget.ES2020) {
                    overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.ES2022] as ModuleKindStrings;
                } else if (scriptTarget && scriptTarget > ts.ScriptTarget.ES2015) {
                    overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.ES2020] as ModuleKindStrings;
                } else {
                    overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.ES2015] as ModuleKindStrings;
                }
            }
        } else if (options.moduleFormat === 'iife') {
            // TODO: To review
            if (configFileCompilerOptions.module == null) {
                overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.ES2015] as ModuleKindStrings;
            }
        }
    } else if (
        configFileCompilerOptions.module === ts.ModuleKind.NodeNext ||
        configFileCompilerOptions.module === ts.ModuleKind.Node16
    ) {
        // TODO: Warn instead
        //
        // 'NodeNext' is currently incompatible with Rollup typescript
        overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.ESNext] as ModuleKindStrings;
    }

    if (options.declaration != null) {
        overrideCompilerOptions.declaration = options.declaration;
    } else if (configFileCompilerOptions.declaration != null) {
        overrideCompilerOptions.declaration = configFileCompilerOptions.declaration;
    }

    if (options.sourceMap) {
        overrideCompilerOptions.sourceMap = true;
        overrideCompilerOptions.inlineSourceMap = false;
        overrideCompilerOptions.inlineSources = true;
        if (options.entryFilePath) {
            overrideCompilerOptions.sourceRoot = path.dirname(options.entryFilePath);
        }
    } else {
        overrideCompilerOptions.sourceMap = false;
        overrideCompilerOptions.inlineSourceMap = false;
        overrideCompilerOptions.inlineSources = false;
        if (!configFileCompilerOptions.sourceRoot != null) {
            overrideCompilerOptions.sourceRoot = '';
        }
    }

    if (options.preserveSymlinks != null) {
        overrideCompilerOptions.preserveSymlinks = options.preserveSymlinks;
    }

    return overrideCompilerOptions;
}

export function getGlobalVariable(moduleId: string, globalsRecord: Record<string, string> = {}): string {
    const foundName = globalsRecord[moduleId];

    if (foundName) {
        return foundName;
    }

    let globalName = moduleId.replace(/\//g, '.');
    globalName = dashToCamelCase(globalName);

    if (globalName.startsWith('@angular')) {
        globalName = globalName.replace(/^@angular/, 'ng');
    } else if (globalName.startsWith('@')) {
        globalName = globalName.substring(1);
    } else if (globalName === 'jquery') {
        globalName = '$';
    } else if (globalName === 'lodash') {
        globalName = '_';
    }

    return globalName;
}

export default async function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    const moduleFormat: ModuleFormat | undefined = options.moduleFormat;
    const externals = options.externals ?? [];
    let treeshake = options.treeshake;
    if (treeshake == null) {
        treeshake = moduleFormat === 'iife' && options.minify ? true : false;
    }

    const plugins: InputPluginOption[] = [
        // Must be before rollup-plugin-typescript2 in the plugin list, especially when the browser: true option is used
        rollupNodeResolve()
    ];

    if (options.tsConfigInfo) {
        const compilerOptions = getTsCompilerOptionsOverride(options);

        plugins.push(
            rollupTypescript({
                // TODO:
                tsconfig: options.tsConfigInfo.configPath,
                // TODO:
                // tsconfigDefaults: options.tsConfigInfo.compilerOptions,
                tsconfigOverride: { compilerOptions }
                // include: [],
                // exclude: [],

                // For @rollup/plugin-typescript
                // compilerOptions,
                // rootDir: path.dirname(options.entryFilePath),
                // filterRoot: options.tsConfigInfo.configPath ? path.dirname(options.tsConfigInfo.configPath) : undefined,
                // tslib: require.resolve('tslib')
            })
        );
    }

    plugins.push(rollupJson());

    if (moduleFormat === 'cjs') {
        plugins.push(
            // A Rollup plugin to convert CommonJS modules to ES6
            rollupCommonjs({
                extensions: options.tsConfigInfo ? ['.js', '.cjs', '.ts', '.cts'] : ['.js', '.cjs']
            })
        );
    }

    // TODO:
    if (options.substitutions) {
        const replaceValues = options.substitutions
            .filter((s) => !s.bannerOnly)
            .map((s) => {
                return {
                    [s.searchValue]: s.replaceValue
                };
            })
            .reduce((previousObject, currentObject) => {
                // return Object.assign(previousObject, currentObject);
                return { ...previousObject, ...currentObject };
            }, {});

        // TODO:
        plugins.push(
            rollupReplace({
                values: replaceValues,
                preventAssignment: false
            })
        );
    }

    let entryPoints: Record<string, string> | string | undefined;
    if (options.entryFilePath && options.outFilePath) {
        let outExtLength = path.extname(options.outFilePath).length;
        if (/\.d\.[mj]?ts$/i.test(options.outFilePath)) {
            outExtLength += 2;
        }

        const outFilePathWithoutExt = options.outFilePath.substring(0, options.outFilePath.length - outExtLength);

        const outEntryName = normalizePathToPOSIXStyle(path.relative(options.outDir, outFilePathWithoutExt));
        entryPoints = {
            [outEntryName]: options.entryFilePath
        };
    } else if (options.entryFilePath && !options.outFilePath) {
        entryPoints = options.entryFilePath;
    }

    const inputOptions: InputOptions = {
        input: entryPoints,
        external: (moduleId: string): boolean => {
            if (moduleId.startsWith('.') || moduleId.startsWith('/') || path.isAbsolute(moduleId)) {
                return false;
            }

            return externals.some((dep) => moduleId === dep || moduleId.startsWith(`${dep}/`));
        },
        plugins,
        preserveSymlinks: options.preserveSymlinks,
        treeshake,
        // TODO:
        logLevel: options.logLevel === 'debug' ? 'debug' : 'warn',
        onLog: (logLevel, log) => {
            if (typeof log === 'string') {
                logger.log(logLevel, log);

                return;
            }

            if (
                !log.message ||
                log.code === 'THIS_IS_UNDEFINED' ||
                log.code === 'CIRCULAR_DEPENDENCY' ||
                log.code === 'UNUSED_EXTERNAL_IMPORT'
            ) {
                return;
            }

            if (log.loc) {
                const lineAndCol = `${log.loc.line}:${log.loc.column}`;
                let msg = `${colors.lightCyan(`${log.loc.file}`)}:${colors.lightYellow(lineAndCol)} - ${log.message}`;
                if (log.frame) {
                    msg += log.frame;
                }
                logger.log(logLevel, msg);
            } else {
                logger.log(logLevel, log.message);
            }
        }
    };

    const outputOptions: OutputOptions = {
        dir: options.outDir,
        // TODO:
        // file: options.outFilePath,
        format: moduleFormat,
        name: options.globalName,
        extend: true,
        sourcemap: options.sourceMap,
        banner: options.banner,
        footer: options.footer,
        globals: (moduleid) => getGlobalVariable(moduleid, options.globals),
        // entryFileNames: '[name].mjs',
        // inlineDynamicImports: moduleFormat === 'iife' || moduleFormat === 'umd' ? true : false, // Default:	false
        generatedCode: options.scriptTarget === 'ES5' ? 'es5' : 'es2015',
        externalImportAssertions: true
    };

    const dryRunSuffix = options.dryRun ? ' [dry run]' : '';
    logger.info(`Bundling with ${colors.lightMagenta('rollup')}...${dryRunSuffix}`);

    if (options.entryFilePath) {
        logger.info(
            `With entry file: ${normalizePathToPOSIXStyle(path.relative(process.cwd(), options.entryFilePath))}`
        );
    }

    if (options.tsConfigInfo?.configPath) {
        logger.info(
            `With tsconfig file: ${normalizePathToPOSIXStyle(
                path.relative(process.cwd(), options.tsConfigInfo.configPath)
            )}`
        );
    }

    if (moduleFormat) {
        logger.info(`With module format: ${moduleFormat}`);
    }

    // if (platform) {
    //     logger.info(`With platform: ${platform}`);
    // }

    // if (targets.length > 0) {
    //     logger.info(`With target: ${targets.join(',')}`);
    // }

    let bundle: RollupBuild | undefined;

    try {
        const startTime = Date.now();

        bundle = await rollup(inputOptions);

        logger.info(`With output module format: '${moduleFormat}', script target: '${options.scriptTarget}'`);

        const { output } = await bundle.generate(outputOptions);

        const duration = Date.now() - startTime;
        const builtAssets: CompileAsset[] = [];

        for (const chunkOrAsset of output) {
            const outputFilePath = path.resolve(options.outDir, chunkOrAsset.fileName);
            const source = chunkOrAsset.type === 'asset' ? chunkOrAsset.source : chunkOrAsset.code;

            if (!options.dryRun) {
                const dirOfOutFile = path.dirname(outputFilePath);

                if (!(await pathExists(dirOfOutFile))) {
                    await fs.mkdir(dirOfOutFile, { recursive: true });
                }

                await fs.writeFile(outputFilePath, source, 'utf-8');
            }

            const size = Array.isArray(source) ? source.length : Buffer.byteLength(source, 'utf-8');

            builtAssets.push({
                path: outputFilePath,
                size,
                // TODO:
                isEntry:
                    options.outFilePath && options.entryFilePath && isSamePath(outputFilePath, options.outFilePath)
                        ? true
                        : false
            });

            const prefix = options.dryRun ? 'Built: ' : 'Emitted: ';
            const sizeSuffix = size ? ` - size: ${formatSizeInBytes(size)}` : '';
            logger.info(
                `${prefix}${normalizePathToPOSIXStyle(path.relative(process.cwd(), outputFilePath))}${sizeSuffix}`
            );
        }

        if (bundle) {
            await bundle.close();
        }

        return {
            time: duration,
            builtAssets
        };
    } catch (err) {
        if (bundle) {
            await bundle.close();
        }

        const rollupErr = err as RollupError;

        throw new CompilationError(rollupErr.message);
    }
}
