/* eslint-disable import/no-named-as-default-member */
/* eslint-disable import/default */

import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import { InputOptions, InputPluginOption, ModuleFormat, OutputOptions, RollupBuild, RollupError, rollup } from 'rollup';
import ts from 'typescript';

import { CompilationError } from '../../../../../exceptions/index.js';
import {
    LoggerBase,
    colors,
    dashCaseToCamelCase,
    formatSizeInBytes,
    normalizePathToPOSIXStyle,
    pathExists
} from '../../../../../utils/index.js';

import { CompileAsset, CompileOptions, CompileResult } from '../../interfaces/index.js';

const require = createRequire(process.cwd() + '/');

// import { nodeResolve } from '@rollup/plugin-node-resolve';
const rollupNodeResolve =
    require('@rollup/plugin-node-resolve') as typeof import('@rollup/plugin-node-resolve').default;
const rollupJson = require('@rollup/plugin-json') as typeof import('@rollup/plugin-json').default;
const rollupTypescript = require('@rollup/plugin-typescript') as typeof import('@rollup/plugin-typescript').default;
const rollupCommonjs = require('@rollup/plugin-commonjs') as typeof import('@rollup/plugin-commonjs').default;
const rollupReplace = require('@rollup/plugin-replace') as typeof import('@rollup/plugin-replace').default;

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

export function getGlobalVariable(moduleId: string, globalsRecord: Record<string, string> = {}): string {
    const foundName = globalsRecord[moduleId];

    if (foundName) {
        return foundName;
    }

    let globalName = moduleId.replace(/\//g, '.');
    globalName = dashCaseToCamelCase(globalName);

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
    const tsCompilerOptions = getTsCompilerOptions(options);
    const externals = options.externals ?? [];
    let treeshake = options.treeshake;
    if (treeshake == null) {
        treeshake = moduleFormat === 'iife' || moduleFormat === 'umd' ? true : false;
    }

    const plugins: InputPluginOption[] = [
        // Must be before rollup-plugin typescript in the plugin list,
        rollupNodeResolve(),
        rollupJson()
    ];

    if (options.tsConfigInfo) {
        plugins.push(
            rollupTypescript({
                tsconfig: options.tsConfigInfo.configPath,
                compilerOptions: tsCompilerOptions,
                rootDir: path.dirname(options.entryFilePath),
                filterRoot: options.tsConfigInfo.configPath ? path.dirname(options.tsConfigInfo.configPath) : undefined,
                tslib: require.resolve('tslib')
                // include: [],
                // exclude: [],
                // transformers
            })
        );
    }

    if (moduleFormat === 'cjs') {
        plugins.push(
            // A Rollup plugin to convert CommonJS modules to ES6
            rollupCommonjs({
                extensions: options.tsConfigInfo ? ['.js', '.cjs', '.ts', '.cts'] : ['.js', '.cjs']
            })
        );
    }

    if (options.substitutions) {
        const replaceValues = options.substitutions
            .filter((s) => !s.bannerOnly)
            .map((s) => {
                return {
                    [s.searchString]: s.value
                };
            })
            .reduce((previousObject, currentObject) => {
                // return Object.assign(previousObject, currentObject);
                return { ...previousObject, ...currentObject };
            }, {});

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
        preserveSymlinks: options.preserveSymlinks,
        treeshake,
        logLevel: options.logLevel === 'debug' ? 'debug' : 'warn',
        onLog: (logLevel, log) => {
            if (typeof log === 'string') {
                logger.warn(log);

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
        },
        plugins
    };

    const outputOptions: OutputOptions = {
        file: options.outFilePath,
        format: moduleFormat,
        name: options.globalName,
        // extend: true,
        sourcemap: options.sourceMap,
        banner: options.bannerText,
        globals: (moduleid) => getGlobalVariable(moduleid, options.globals),
        entryFileNames: '[name].mjs',
        // inlineDynamicImports: moduleFormat === 'iife' || moduleFormat === 'umd' ? true : false, // Default:	false
        generatedCode: options.scriptTarget === 'ES5' ? 'es5' : 'es2015'
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
    logger.info(`With module format: '${moduleFormat}', script target: '${options.scriptTarget}'`);

    let bundle: RollupBuild | undefined;

    try {
        const startTime = Date.now();

        bundle = await rollup(inputOptions);

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
