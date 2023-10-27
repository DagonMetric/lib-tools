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
    getShortestBasePath,
    isInFolder,
    normalizePathToPOSIXStyle,
    pathExists
} from '../../../../../../utils/index.mjs';

import { CompilationError } from '../../../../../exceptions/index.mjs';

import { CompileAsset, CompileOptions, CompileResult } from '../compile-interfaces.mjs';
import { getEntryOutFileInfo } from '../compile-options-helpers.mjs';
import { ts } from '../tsproxy.mjs';

const require = createRequire(process.cwd() + '/');

const rollupNodeResolve =
    require('@rollup/plugin-node-resolve') as typeof import('@rollup/plugin-node-resolve').default;
const rollupJson = require('@rollup/plugin-json') as typeof import('@rollup/plugin-json').default;

// const rollupTypescript = require('@rollup/plugin-typescript') as typeof import('@rollup/plugin-typescript').default;
const rollupTypescript = require('rollup-plugin-typescript2') as typeof import('rollup-plugin-typescript2').default;

const rollupCommonjs = require('@rollup/plugin-commonjs') as typeof import('@rollup/plugin-commonjs').default;
const rollupReplace = require('@rollup/plugin-replace') as typeof import('@rollup/plugin-replace').default;

type ScriptTarget = keyof typeof ts.ScriptTarget;
type ModuleKindStrings = keyof typeof ts.ModuleKind;
type ModuleResolutionKindStrings = keyof typeof ts.ModuleResolutionKind;

interface JsonTsCompilerOptions extends Omit<CompilerOptions, 'target' | 'module' | 'moduleResolution'> {
    target?: ScriptTarget;
    module?: ModuleKindStrings;
    moduleResolution?: ModuleResolutionKindStrings;
}

function getTsCompilerOptionsOverride(options: CompileOptions): JsonTsCompilerOptions {
    if (!options.tsConfigInfo?.compilerOptions) {
        return {};
    }

    const configFileCompilerOptions = options.tsConfigInfo.compilerOptions;

    const overrideCompilerOptions: JsonTsCompilerOptions = {
        ...(configFileCompilerOptions as JsonTsCompilerOptions)
    };

    if (configFileCompilerOptions.target) {
        const targetStr = ts.ScriptTarget[configFileCompilerOptions.target];
        if (targetStr === 'Latest') {
            // 'latest' is currently incompatible with Rollup typescript
            overrideCompilerOptions.target = 'ESNext';
        } else {
            overrideCompilerOptions.target = targetStr as ScriptTarget;
        }
    }

    if (configFileCompilerOptions.moduleResolution) {
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
        } else {
            overrideCompilerOptions.moduleResolution = ts.ModuleResolutionKind[
                configFileCompilerOptions.moduleResolution
            ] as ModuleResolutionKindStrings;
        }
    }

    if (configFileCompilerOptions.module) {
        if (
            configFileCompilerOptions.module === ts.ModuleKind.NodeNext ||
            configFileCompilerOptions.module === ts.ModuleKind.Node16
        ) {
            // TODO: Warn instead
            //
            // 'NodeNext' is currently incompatible with Rollup typescript
            overrideCompilerOptions.module = ts.ModuleKind[ts.ModuleKind.ESNext] as ModuleKindStrings;
        } else {
            overrideCompilerOptions.module = ts.ModuleKind[configFileCompilerOptions.module] as ModuleKindStrings;
        }
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
    let moduleFormat: ModuleFormat | undefined;
    if (options.moduleFormat === 'esm') {
        moduleFormat = 'esm';
    } else if (options.moduleFormat === 'cjs') {
        moduleFormat = 'cjs';
    } else if (options.moduleFormat === 'umd') {
        moduleFormat = 'umd';
    } else if (options.moduleFormat === 'iife') {
        moduleFormat = 'iife';
    } else if (options.moduleFormat === 'amd') {
        moduleFormat = 'amd';
    } else if (options.moduleFormat === 'system') {
        moduleFormat = 'system';
    } else {
        logger.warn(`Module format '${options.moduleFormat}' is currently not supported in esbuild compiler tool.`);
    }

    const externals = options.externals ?? [];

    // TODO: Sync with other bundlers
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
                // compilerOptions: options.tsConfigInfo.compilerOptions,
                // rootDir: options.entryFilePath ? path.dirname(options.entryFilePath) : options.taskInfo.projectRoot,
                // filterRoot: options.tsConfigInfo.configPath ? path.dirname(options.tsConfigInfo.configPath) : undefined
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
                // TODO:
                // delimiters: ['',''],
                // TODO:
                // include:
                preventAssignment: false
            })
        );
    }

    let entryPoints: Record<string, string> | string[] | undefined;
    if (options.entryPoints && options.entryPointsPreferred !== false) {
        entryPoints = options.entryPoints;
    } else {
        entryPoints = options.tsConfigInfo?.fileNames ? [...options.tsConfigInfo.fileNames] : undefined;
    }

    const { projectRoot } = options.taskInfo;
    let entryRoot: string | undefined;
    let outBase: string | undefined;

    let suggestedJsOutExt = '.js';

    if (entryPoints) {
        const entryFilePaths = Array.isArray(entryPoints) ? entryPoints : Object.entries(entryPoints).map((e) => e[1]);
        if (entryFilePaths.length > 1) {
            const rootBasePath = getShortestBasePath(entryFilePaths.map((p) => path.dirname(p)));
            if (rootBasePath && isInFolder(projectRoot, rootBasePath)) {
                entryRoot = rootBasePath;
                outBase = normalizePathToPOSIXStyle(path.relative(projectRoot, entryRoot));
            }
        } else if (entryFilePaths.length === 1) {
            entryRoot = path.dirname(entryFilePaths[0]);
        }

        if (moduleFormat === 'esm' && entryFilePaths.some((e) => /\.m[tj]s$/i.test(e))) {
            suggestedJsOutExt = '.mjs';
        } else if (moduleFormat === 'cjs' && entryFilePaths.some((e) => /\.c[tj]s$/i.test(e))) {
            suggestedJsOutExt = '.cjs';
        } else if (entryFilePaths.some((e) => /\.[tj]sx$/i.test(e))) {
            suggestedJsOutExt = '.jsx';
        }
    } else {
        // throw?
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
        // TODO:
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
        // TODO: To sync with other bundlers
        assetFileNames: options.assetOut,
        entryFileNames: `[name]${suggestedJsOutExt}`,
        chunkFileNames: `[name]-[hash]${suggestedJsOutExt}`,
        // TODO:
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
        externalImportAssertions: true,
        interop: options.tsConfigInfo?.compilerOptions.esModuleInterop ? 'auto' : 'default',
        // TODO: To review
        preserveModules: true,
        preserveModulesRoot: outBase
    };

    const dryRunSuffix = options.dryRun ? ' [dry run]' : '';
    logger.info(`Bundling with ${colors.lightMagenta('rollup')}...${dryRunSuffix}`);

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
                isEntry: entryPoints
                    ? getEntryOutFileInfo({
                          currentOutFilePath: outputFilePath,
                          outDir: options.outDir,
                          outBase,
                          entryPoints,
                          projectRoot,
                          entryRoot
                      }).isEntry
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
