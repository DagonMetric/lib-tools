/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
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
}

function getTsCompilerOptionsOverride(options: CompileOptions): JsonTsCompilerOptions {
    const configFileCompilerOptions = options.tsConfigInfo?.compilerOptions ?? {};

    const compilerOptions: JsonTsCompilerOptions = {};

    compilerOptions.outDir = path.dirname(options.outFilePath);
    compilerOptions.rootDir = path.dirname(options.entryFilePath);

    const scriptTarget = ts.ScriptTarget[options.scriptTarget];
    compilerOptions.target = ts.ScriptTarget[scriptTarget] as ScriptTargetStrings;

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
            if (configFileCompilerOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext) {
                compilerOptions.module = ts.ModuleKind[ts.ModuleKind.NodeNext] as ModuleKindStrings;
            } else if (configFileCompilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16) {
                compilerOptions.module = ts.ModuleKind[ts.ModuleKind.Node16] as ModuleKindStrings;
            } else {
                compilerOptions.module = ts.ModuleKind[ts.ModuleKind.CommonJS] as ModuleKindStrings;
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
                compilerOptions.module = ts.ModuleKind[ts.ModuleKind.NodeNext] as ModuleKindStrings;
            } else if (configFileCompilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16) {
                compilerOptions.module = ts.ModuleKind[ts.ModuleKind.Node16] as ModuleKindStrings;
            } else if (scriptTarget > ts.ScriptTarget.ES2022) {
                compilerOptions.module = ts.ModuleKind[ts.ModuleKind.ESNext] as ModuleKindStrings;
            } else if (scriptTarget > ts.ScriptTarget.ES2020) {
                compilerOptions.module = ts.ModuleKind[ts.ModuleKind.ES2022] as ModuleKindStrings;
            } else if (scriptTarget > ts.ScriptTarget.ES2015) {
                compilerOptions.module = ts.ModuleKind[ts.ModuleKind.ES2020] as ModuleKindStrings;
            } else {
                compilerOptions.module = ts.ModuleKind[ts.ModuleKind.ES2015] as ModuleKindStrings;
            }
        }
    } else if (options.moduleFormat === 'iife') {
        // TODO: To review
        if (configFileCompilerOptions.module == null) {
            compilerOptions.module = ts.ModuleKind[ts.ModuleKind.ES2015] as ModuleKindStrings;
        }
    }

    if (options.declaration != null) {
        compilerOptions.declaration = options.declaration;
    } else if (configFileCompilerOptions.declaration != null) {
        compilerOptions.declaration = configFileCompilerOptions.declaration;
    }

    if (options.sourceMap) {
        compilerOptions.sourceMap = true;
        compilerOptions.inlineSourceMap = false;
        compilerOptions.inlineSources = true;
        compilerOptions.sourceRoot = path.dirname(options.entryFilePath);
    } else {
        compilerOptions.sourceMap = false;
        compilerOptions.inlineSourceMap = false;
        compilerOptions.inlineSources = false;
        if (!configFileCompilerOptions.sourceRoot != null) {
            compilerOptions.sourceRoot = '';
        }
    }

    if (options.preserveSymlinks != null) {
        compilerOptions.preserveSymlinks = options.preserveSymlinks;
    }

    return compilerOptions;
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
    const moduleFormat: ModuleFormat = options.moduleFormat;
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
                tsconfig: options.tsConfigInfo.configPath,
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

    const inputOptions: InputOptions = {
        input: options.entryFilePath,
        external: (moduleId: string): boolean => {
            if (moduleId.startsWith('.') || moduleId.startsWith('/') || path.isAbsolute(moduleId)) {
                return false;
            }

            return externals.some((dep) => moduleId === dep || moduleId.startsWith(`${dep}/`));
        },
        plugins,
        preserveSymlinks: options.preserveSymlinks,
        treeshake,
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
        file: options.outFilePath,
        format: moduleFormat,
        name: options.globalName,
        extend: true,
        sourcemap: options.sourceMap,
        // TODO: Include / Exclude
        banner: options.banner?.text,
        // TODO: Include / Exclude
        footer: options.footer?.text,
        globals: (moduleid) => getGlobalVariable(moduleid, options.globals),
        // entryFileNames: '[name].mjs',
        // inlineDynamicImports: moduleFormat === 'iife' || moduleFormat === 'umd' ? true : false, // Default:	false
        generatedCode: options.scriptTarget === 'ES5' ? 'es5' : 'es2015',
        externalImportAssertions: true
    };

    const dryRunSuffix = options.dryRun ? ' [dry run]' : '';
    logger.info(`Bundling with ${colors.lightMagenta('rollup')}...${dryRunSuffix}`);
    const entryFilePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), options.entryFilePath));
    logger.info(`With entry file: ${entryFilePathRel}`);
    if (options.tsConfigInfo?.configPath) {
        const tsConfigPathRel = normalizePathToPOSIXStyle(
            path.relative(process.cwd(), options.tsConfigInfo.configPath)
        );

        logger.info(`With tsconfig file: ${tsConfigPathRel}`);
    }

    let bundle: RollupBuild | undefined;

    try {
        const startTime = Date.now();

        bundle = await rollup(inputOptions);

        logger.info(`With output module format: '${moduleFormat}', script target: '${options.scriptTarget}'`);

        const { output } = await bundle.generate(outputOptions);

        const duration = Date.now() - startTime;
        const builtAssets: CompileAsset[] = [];

        for (const chunkOrAsset of output) {
            const outputFilePath = path.resolve(path.dirname(options.outFilePath), chunkOrAsset.fileName);
            const outputFilePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), outputFilePath));

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
                size
            });

            const prefix = options.dryRun ? 'Built: ' : 'Emitted: ';
            const sizeSuffix = size ? ` - size: ${formatSizeInBytes(size)}` : '';
            logger.info(`${prefix}${outputFilePathRel}${sizeSuffix}`);
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