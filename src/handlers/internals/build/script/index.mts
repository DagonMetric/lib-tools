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
import { pathToFileURL } from 'node:url';

import { CompilerOptions } from 'typescript';

import {
    AssetLoader,
    ScriptCompilation,
    ScriptModuleFormat,
    ScriptOptions,
    ScriptTarget,
    TreeshakingOptions
} from '../../../../config-models/index.mjs';
import {
    LogLevelStrings,
    LoggerBase,
    colors,
    dashToCamelCase,
    findUp,
    getShortestBasePath,
    isInFolder,
    isSamePath,
    normalizePathToPOSIXStyle,
    pathExists,
    resolvePath
} from '../../../../utils/index.mjs';

import { BuildTask } from '../../../build-task.mjs';
import { InvalidCommandOptionError, InvalidConfigError } from '../../../exceptions/index.mjs';
import { HandlerOptions } from '../../../handler-options.mjs';
import { TaskInfo } from '../../../task-info.mjs';

import { getBannerText } from '../../get-banner-text.mjs';
import { PackageJsonInfo, getPackageJsonInfo } from '../../get-package-json-info.mjs';
import { getSubstitutions } from '../../get-substitutions.mjs';

import { CompileAsset, CompileOptions, CompileResult, TsConfigInfo } from './compilers/compile-interfaces.mjs';
import { setTypescriptModule, ts } from './compilers/tsproxy.mjs';

export type CompilerFn = (options: CompileOptions, logger: LoggerBase) => Promise<CompileResult>;

const tsConfigPathsCache = new Map<string, string>();
const tsConfigInfoCache = new Map<string, { locationKey: string; tsConfigInfo: TsConfigInfo }>();
const entryFilePathsCache = new Map<string, string>();
const compilerCache = new Map<string, CompilerFn>();
let lastDetectectedEntryFileExt: string | null = null;

const cwdRequire = createRequire(process.cwd() + '/');

// TODO: try catch
// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
setTypescriptModule(cwdRequire('typescript'));

async function searchFileByExtensions(
    extNames: readonly string[],
    fileNames: readonly string[],
    rootDirs: readonly string[],
    includePaths: readonly string[] | undefined
): Promise<string | null> {
    for (const extName of extNames) {
        for (const rootDir of rootDirs) {
            for (const fileName of fileNames) {
                const fileNameWithExt = fileName + extName;
                const foundPath = await findUp(fileNameWithExt, null, rootDir, true);
                if (
                    foundPath &&
                    (includePaths == null || includePaths.some((includePath) => isSamePath(includePath, foundPath)))
                ) {
                    return foundPath;
                }
            }
        }
    }

    return null;
}

function getLastPartPackageName(packageName: string): string {
    const lastSlashIndex = packageName.lastIndexOf('/');
    const lastPartPackageName = lastSlashIndex > -1 ? packageName.substring(lastSlashIndex + 1) : packageName;

    return lastPartPackageName;
}

function getYearFromScriptTarget(scriptTarget: ScriptTarget): number {
    if (scriptTarget === 'ESNext') {
        const year = new Date().getFullYear() - 1;
        const esmVerson = year - 2013;
        if (esmVerson > 1 && esmVerson < 99) {
            return year;
        } else {
            return 0;
        }
    }

    const esYearRegExp = /^es(2\d{3,3})/i;
    const m = scriptTarget.match(esYearRegExp);
    if (m != null && m.length > 1) {
        const yearStr = m[1];

        return parseInt(yearStr, 10);
    }

    return 0;
}

function getTsCompilerOptionsOverride(
    tsConfigInfo: TsConfigInfo,
    compilation: ParsedCompilation,
    taskInfo: TaskInfo
): CompilerOptions {
    const compilerOptions: CompilerOptions = JSON.parse(
        JSON.stringify(tsConfigInfo.compilerOptions)
    ) as CompilerOptions;

    compilerOptions.outDir = compilation._outDir;

    let entryFilePaths: string[];
    if (compilation._entryPoints && (compilation.entry ?? !tsConfigInfo.fileNames.length)) {
        entryFilePaths = Object.entries(compilation._entryPoints).map((pair) => pair[1]);
    } else {
        entryFilePaths = [...tsConfigInfo.fileNames];
    }

    let rootBasePath: string | undefined;

    const { projectRoot } = taskInfo;

    if (entryFilePaths.length > 0) {
        if (entryFilePaths.length > 1) {
            rootBasePath = getShortestBasePath(entryFilePaths.map((p) => path.dirname(p)));
        } else if (compilation.entry) {
            rootBasePath = path.dirname(entryFilePaths[0]);
        }

        if (rootBasePath && (isSamePath(projectRoot, rootBasePath) || isInFolder(projectRoot, rootBasePath))) {
            compilerOptions.rootDir = rootBasePath;
        }

        if (entryFilePaths.some((entryFilePath) => /\.(jsx|mjs|cjs|js)$/i.test(entryFilePath))) {
            compilerOptions.allowJs = true;
        }
    }

    if (compilerOptions.rootDir == null) {
        compilerOptions.rootDir = projectRoot;
    }

    if (compilation._scriptTarget != null) {
        const scriptTarget = ts.ScriptTarget[compilation._scriptTarget];
        compilerOptions.target = scriptTarget;
    }

    if (compilerOptions.target === ts.ScriptTarget.Latest) {
        compilerOptions.target = ts.ScriptTarget.ESNext;
    }

    if (compilation._moduleFormat === 'cjs') {
        if (
            compilerOptions.module == null ||
            (compilerOptions.module !== ts.ModuleKind.CommonJS &&
                compilerOptions.module !== ts.ModuleKind.Node16 &&
                compilerOptions.module !== ts.ModuleKind.NodeNext)
        ) {
            if (compilerOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext) {
                compilerOptions.module = ts.ModuleKind.NodeNext;
            } else if (compilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16) {
                compilerOptions.module = ts.ModuleKind.Node16;
            } else {
                compilerOptions.module = ts.ModuleKind.CommonJS;
            }
        }
    } else if (compilation._moduleFormat === 'esm') {
        if (
            compilerOptions.module == null ||
            compilerOptions.module === ts.ModuleKind.None ||
            compilerOptions.module === ts.ModuleKind.AMD ||
            compilerOptions.module === ts.ModuleKind.CommonJS ||
            compilerOptions.module === ts.ModuleKind.System ||
            compilerOptions.module === ts.ModuleKind.UMD
        ) {
            if (compilerOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext) {
                compilerOptions.module = ts.ModuleKind.NodeNext;
            } else if (compilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16) {
                compilerOptions.module = ts.ModuleKind.Node16;
            } else if (compilerOptions.target && compilerOptions.target > ts.ScriptTarget.ES2022) {
                compilerOptions.module = ts.ModuleKind.ESNext;
            } else if (compilerOptions.target && compilerOptions.target > ts.ScriptTarget.ES2020) {
                compilerOptions.module = ts.ModuleKind.ES2022;
            } else if (compilerOptions.target && compilerOptions.target > ts.ScriptTarget.ES2015) {
                compilerOptions.module = ts.ModuleKind.ES2020;
            } else {
                compilerOptions.module = ts.ModuleKind.ES2015;
            }
        }
    } else if (compilation._moduleFormat === 'umd' || compilation._moduleFormat === 'iife') {
        compilerOptions.module = ts.ModuleKind.UMD;
    }

    if (compilation._declaration != null) {
        compilerOptions.declaration = compilation._declaration;
    }

    if (compilation._emitDeclarationOnly != null) {
        compilerOptions.emitDeclarationOnly = compilation._emitDeclarationOnly;
    }

    if (compilerOptions.emitDeclarationOnly) {
        compilerOptions.declaration = true;
        compilerOptions.sourceMap = undefined;
        compilerOptions.inlineSourceMap = undefined;
        compilerOptions.inlineSources = undefined;
        compilerOptions.sourceRoot = undefined;
        if (compilerOptions.types && !compilerOptions.types.length) {
            compilerOptions.types = undefined;
        }
    } else {
        if (compilation._sourceMap) {
            if (rootBasePath && compilerOptions.sourceRoot == null) {
                compilerOptions.sourceRoot = rootBasePath;
            }

            if (
                (compilerOptions.sourceMap != null && compilerOptions.inlineSourceMap != null) ||
                (!compilerOptions.sourceMap && !compilerOptions.inlineSourceMap)
            ) {
                compilerOptions.sourceMap = true;
                compilerOptions.inlineSourceMap = false;
            }
        } else {
            compilerOptions.sourceMap = false;
            compilerOptions.inlineSourceMap = false;
            compilerOptions.inlineSources = false;
            compilerOptions.sourceRoot = undefined;
        }
    }

    if (compilation._preserveSymlinks != null) {
        compilerOptions.preserveSymlinks = compilation._preserveSymlinks;
    }

    return compilerOptions;
}

interface ParsedCompilation extends Readonly<Pick<ScriptCompilation, 'compiler' | 'entry'>> {
    compiler: 'tsc' | 'esbuild' | 'rollup' | 'webpack' | 'custom' | undefined;
    entry: string | string[] | Record<string, string> | undefined;

    readonly _outDir: string;
    readonly _entryPoints: string[] | Record<string, string> | undefined;
    readonly _moduleFormat: ScriptModuleFormat | undefined;
    readonly _scriptTarget: ScriptTarget | undefined;
    readonly _bundle: boolean | undefined;
    readonly _sourceMap: boolean | undefined;
    readonly _minify: boolean | undefined;
    readonly _environmentTargets: readonly string[] | undefined;
    readonly _externals: readonly string[] | undefined;
    readonly _tsConfigInfo: Readonly<TsConfigInfo> | undefined;
    readonly _declaration: boolean | undefined;
    readonly _emitDeclarationOnly: boolean | undefined;
    readonly _globals: Readonly<Record<string, string>> | undefined;
    readonly _preserveSymlinks: boolean | undefined;
    readonly _globalName: string | undefined;
    readonly _treeshake: boolean | Readonly<TreeshakingOptions> | undefined;
    readonly _assetLoaders: Record<string, AssetLoader> | undefined;
    readonly _assetOut: string | undefined;
}

export interface ScriptTaskRunnerOptions {
    readonly scriptOptions: Readonly<ScriptOptions>;
    readonly buildTask: Readonly<BuildTask>;
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings;
    readonly dryRun: boolean;
    readonly env: string | undefined;
}

export interface ScriptOutputAsset extends CompileAsset {
    readonly moduleFormat: ScriptModuleFormat | undefined;
}

export interface ScriptResult {
    readonly outputAssets: readonly ScriptOutputAsset[];
    readonly time: number;
}

export class ScriptTaskRunner {
    private readonly logger: LoggerBase;
    private readonly configLocationPrefix: string;

    constructor(readonly options: ScriptTaskRunnerOptions) {
        this.logger = this.options.logger;

        const taskLocation = `tasks/${this.options.buildTask.taskName}/script`;
        this.configLocationPrefix = this.options.buildTask.projectName
            ? `projects/${this.options.buildTask.projectName}/${taskLocation}`
            : taskLocation;
    }

    async run(): Promise<ScriptResult> {
        this.logger.group('\u25B7 script');

        const { workspaceRoot, projectRoot, projectName, taskName, configPath } = this.options.buildTask;

        const scriptOptions = this.options.scriptOptions;

        const substitutions = await getSubstitutions(scriptOptions.substitutions, this.options.buildTask);
        const bannerText = await getBannerText(
            'banner',
            'script',
            scriptOptions.banner,
            this.options.buildTask,
            substitutions
        );
        const footerText = await getBannerText(
            'footer',
            'script',
            scriptOptions.footer,
            this.options.buildTask,
            substitutions
        );

        const outputAssets: ScriptOutputAsset[] = [];
        let totalTime = 0;
        const compilations = await this.getParsedCompilations();

        for (let i = 0; i < compilations.length; i++) {
            const compilation = compilations[i];

            if (compilations.length > 1) {
                this.logger.group(`\u25B7 compilations/${i}`);
            }

            const taskInfo: TaskInfo = {
                taskName,
                workspaceRoot,
                projectRoot,
                projectName,
                configPath
            };

            const entryPointsPreferred =
                compilation._entryPoints &&
                ((compilation.entry ?? compilation.compiler === 'esbuild') ||
                    compilation.compiler === 'rollup' ||
                    compilation.compiler === 'webpack' ||
                    !compilation._tsConfigInfo?.fileNames.length)
                    ? true
                    : undefined;

            let tsConfigInfo: TsConfigInfo | undefined;
            if (compilation._tsConfigInfo) {
                const compilerOptions = getTsCompilerOptionsOverride(compilation._tsConfigInfo, compilation, taskInfo);
                tsConfigInfo = {
                    compilerOptions,
                    fileNames: [...compilation._tsConfigInfo.fileNames],
                    configPath: compilation._tsConfigInfo.configPath
                };
            }

            const compileOptions: CompileOptions = {
                taskInfo: {
                    ...taskInfo,
                    compilationIndex: Array.isArray(this.options.scriptOptions.compilations) ? i : undefined
                },
                entryPoints: compilation._entryPoints,
                entryPointsPreferred,
                outDir: compilation._outDir,
                moduleFormat: compilation._moduleFormat,
                scriptTarget: compilation._scriptTarget,
                sourceMap: compilation._sourceMap,
                minify: compilation._minify,
                tsConfigInfo,
                environmentTargets: compilation._environmentTargets,
                externals: compilation._externals,
                globals: compilation._globals,
                preserveSymlinks: compilation._preserveSymlinks,
                globalName: compilation._globalName,
                treeshake: compilation._treeshake,
                bundle: compilation._bundle,
                assetLoaders: compilation._assetLoaders,
                assetOut: compilation._assetOut,
                banner: bannerText,
                footer: footerText,
                substitutions,
                dryRun: this.options.dryRun,
                logLevel: this.options.logLevel
            };

            let compilerFn: (options: CompileOptions, logger: LoggerBase) => Promise<CompileResult>;

            if (
                compilation.compiler?.toLowerCase().trim() === 'tsc' ||
                compilation.compiler?.toLowerCase().trim() === 'typescript' ||
                (!compilation.compiler?.trim().length && (!compilation._bundle || compilation._emitDeclarationOnly))
            ) {
                const cacheKey = 'tsc';
                const cachefn = compilerCache.get(cacheKey);
                if (cachefn) {
                    compilerFn = cachefn;
                } else {
                    const compilerModule = await import('./compilers/tsc/index.mjs');
                    compilerFn = compilerModule.default;
                    compilerCache.set(cacheKey, compilerModule.default);
                }
            } else if (
                compilation.compiler?.toLowerCase().trim() === 'rollup' ||
                (!compilation.compiler?.trim().length && compilation._bundle)
            ) {
                const cacheKey = 'rollup';
                const cachefn = compilerCache.get(cacheKey);
                if (cachefn) {
                    compilerFn = cachefn;
                } else {
                    const compilerModule = await import('./compilers/rollup/index.mjs');
                    compilerFn = compilerModule.default;
                    compilerCache.set(cacheKey, compilerModule.default);
                }
            } else if (compilation.compiler?.toLowerCase().trim() === 'webpack') {
                const cacheKey = 'webpack';
                const cachefn = compilerCache.get(cacheKey);
                if (cachefn) {
                    compilerFn = cachefn;
                } else {
                    const compilerModule = await import('./compilers/webpack/index.mjs');
                    compilerFn = compilerModule.default;
                    compilerCache.set(cacheKey, compilerModule.default);
                }
            } else if (compilation.compiler?.toLowerCase().trim() === 'esbuild') {
                const cacheKey = 'esbuild';
                const cachefn = compilerCache.get(cacheKey);
                if (cachefn) {
                    compilerFn = cachefn;
                } else {
                    const compilerModule = await import('./compilers/esbuild/index.mjs');
                    compilerFn = compilerModule.default;
                    compilerCache.set(cacheKey, compilerModule.default);
                }
            } else if (compilation.compiler && compilation.compiler.trim().length > 0) {
                const handlerStr = compilation.compiler.trim();
                const cacheKey = handlerStr;
                const cachefn = compilerCache.get(cacheKey);
                if (cachefn) {
                    compilerFn = cachefn;
                } else {
                    const handlerPath = resolvePath(projectRoot, handlerStr);

                    const compilerModule = (await import(pathToFileURL(handlerPath).toString())) as {
                        default?: CompilerFn;
                    };

                    if (!compilerModule.default || typeof compilerModule.default !== 'function') {
                        throw new InvalidConfigError(
                            'No default function export found for custom compiler module.',
                            configPath,
                            `${this.configLocationPrefix}/compilations/${i}/compiler`
                        );
                    }

                    compilerFn = compilerModule.default;
                    compilerCache.set(cacheKey, compilerModule.default);
                }
            } else {
                throw new InvalidConfigError(
                    'could not detect compiler tool for script compilation.',
                    configPath,
                    `${this.configLocationPrefix}/compilations/${i}/compiler`
                );
            }

            const compileResult = await compilerFn(compileOptions, this.logger);

            totalTime += compileResult.time;

            let hasEntry = false;
            for (const builtAsset of compileResult.builtAssets) {
                if (builtAsset.isEntry) {
                    hasEntry = true;
                }

                outputAssets.push({
                    ...builtAsset,
                    moduleFormat: compileOptions.moduleFormat
                });
            }

            const builtAssetsCount = compileResult.builtAssets.length;
            const msgSuffix = this.options.dryRun ? 'built [dry run]' : 'emitted';
            const fileverb = builtAssetsCount > 1 ? 'files are' : 'file is';
            this.logger.info(`Total ${builtAssetsCount} ${fileverb} ${msgSuffix}.`);

            if (!hasEntry) {
                this.logger.warn('No exportable entry found in the generated output paths.');
            }

            if (compilations.length > 1) {
                this.logger.groupEnd();
                this.logger.info(
                    `${colors.lightGreen('\u25B6')} compilations/${i} [${colors.lightGreen(
                        `${compileResult.time} ms`
                    )}]`
                );
            }
        }

        const result: ScriptResult = {
            outputAssets,
            time: totalTime
        };

        this.logger.groupEnd();
        this.logger.info(`${colors.lightGreen('\u25B6')} script [${colors.lightGreen(`${result.time} ms`)}]`);

        return result;
    }

    private async getParsedCompilations(): Promise<ParsedCompilation[]> {
        this.logger.debug('Preparing compilations...');

        const { projectRoot, configPath } = this.options.buildTask;

        const packageJsonInfo = await getPackageJsonInfo(this.options.buildTask);

        if (typeof this.options.scriptOptions.compilations === 'boolean') {
            if (!this.options.scriptOptions.compilations) {
                throw new InvalidConfigError(
                    `No compilation options. Specify 'compilations' values in script options.`,
                    configPath,
                    `${this.configLocationPrefix}/compilations`
                );
            }

            this.logger.debug('Detecting tsconfig file for compilation...');

            const tsConfigPath = await this.detectTsConfigPath();

            if (tsConfigPath) {
                this.logger.debug(
                    `Tsconfig file detected: ${normalizePathToPOSIXStyle(path.relative(process.cwd(), tsConfigPath))}`
                );
            }

            const tsConfigInfo = tsConfigPath
                ? await this.getTsConfigInfo({ tsConfigPath, compilation: null, compilationIndex: null })
                : undefined;

            this.logger.debug('Detecting entry file for compilation...');

            const entryFilePath = await this.detectEntryFilePath({
                tsConfigInfo,
                packageJsonInfo
            });

            if (!entryFilePath && !tsConfigInfo) {
                throw new InvalidConfigError(
                    `Could not detect compilations automatically. Specify 'compilations' values in script options manually.`,
                    configPath,
                    `${this.configLocationPrefix}/compilations`
                );
            }

            if (entryFilePath) {
                this.logger.debug(
                    `Entry file detected: ${normalizePathToPOSIXStyle(path.relative(process.cwd(), entryFilePath))}`
                );
            }

            const parsedScriptCompilations: ParsedCompilation[] = [];

            const entry = entryFilePath
                ? normalizePathToPOSIXStyle(path.relative(projectRoot, entryFilePath))
                : undefined;

            const preserveSymlinks =
                this.options.scriptOptions.preserveSymlinks ?? tsConfigInfo?.compilerOptions.preserveSymlinks;

            if (
                packageJsonInfo &&
                packageJsonInfo.packageJsonConfig.private !== false &&
                tsConfigInfo?.compilerOptions.module != null &&
                tsConfigInfo.compilerOptions.module >= ts.ModuleKind.ES2015 &&
                tsConfigInfo.compilerOptions.module <= ts.ModuleKind.ESNext &&
                tsConfigInfo.compilerOptions.target != null &&
                tsConfigInfo.compilerOptions.target >= ts.ScriptTarget.ES2015 &&
                tsConfigInfo.compilerOptions.target <= ts.ScriptTarget.ESNext
            ) {
                const moduleFormat: ScriptModuleFormat = 'esm';
                const scriptTarget =
                    this.getScriptTarget({
                        tsConfigInfo,
                        compilation: null
                    }) ?? 'ESNext';
                const year = getYearFromScriptTarget(scriptTarget);

                // types
                //
                parsedScriptCompilations.push({
                    compiler: 'tsc',
                    entry,

                    _entryPoints: entryFilePath ? [entryFilePath] : undefined,
                    _outDir: path.resolve(this.options.buildTask.outDir, 'types'),
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: true,
                    _declaration: true,
                    _sourceMap: false,
                    _preserveSymlinks: preserveSymlinks,

                    _bundle: undefined,
                    _minify: undefined,
                    _environmentTargets: undefined,
                    _externals: undefined,
                    _globals: undefined,
                    _assetLoaders: undefined,
                    _assetOut: undefined,
                    _globalName: undefined,
                    _treeshake: undefined
                });

                // esm
                //
                parsedScriptCompilations.push({
                    compiler: 'tsc',
                    entry,

                    _entryPoints: entryFilePath ? [entryFilePath] : undefined,
                    _outDir: path.resolve(this.options.buildTask.outDir, `esm${year}`),
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: false,
                    _declaration: false,
                    _sourceMap: true,
                    _preserveSymlinks: preserveSymlinks,

                    _bundle: undefined,
                    _minify: undefined,
                    _environmentTargets: undefined,
                    _externals: undefined,
                    _globals: undefined,
                    _assetLoaders: undefined,
                    _assetOut: undefined,
                    _globalName: undefined,
                    _treeshake: undefined
                });

                // fesm
                //
                // environmentTargets
                const environmentTargets: string[] = this.options.scriptOptions.environmentTargets ?? [];

                // externals and globals
                const { externals, globals } = this.getExternalsAndGlobals({
                    compilation: null,
                    packageJsonInfo
                });

                parsedScriptCompilations.push({
                    compiler: 'esbuild',
                    entry,

                    _entryPoints: entryFilePath ? [entryFilePath] : undefined,
                    _outDir: path.resolve(this.options.buildTask.outDir, `fesm${year}`),
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: false,
                    _declaration: false,
                    _sourceMap: true,
                    _preserveSymlinks: preserveSymlinks,

                    _bundle: true,
                    _minify: undefined,
                    _environmentTargets: [...environmentTargets],
                    _externals: [...externals],
                    _globals: globals,
                    _assetLoaders: undefined,
                    _assetOut: undefined,
                    _globalName: undefined,
                    _treeshake: undefined
                });
            } else {
                // emitDeclarationOnly
                let emitDeclarationOnly: boolean | undefined;
                if (tsConfigInfo?.compilerOptions.emitDeclarationOnly != null) {
                    emitDeclarationOnly = tsConfigInfo.compilerOptions.emitDeclarationOnly;
                }

                // declaration
                let declaration: boolean | undefined;
                if (emitDeclarationOnly) {
                    declaration = true;
                } else if (tsConfigInfo?.compilerOptions.declaration != null) {
                    declaration = tsConfigInfo.compilerOptions.declaration;
                }

                const entryPoints = entryFilePath ? [entryFilePath] : undefined;

                // moduleFormat
                const moduleFormat = this.getModuleFormat({
                    compilation: null,
                    tsConfigInfo,
                    entryPoints,
                    packageJsonInfo
                });

                // scriptTarget
                const scriptTarget = this.getScriptTarget({
                    compilation: null,
                    tsConfigInfo
                });

                // minify
                const minify =
                    (moduleFormat === 'iife' || moduleFormat === 'umd') && !emitDeclarationOnly ? true : undefined;

                // sourceMap
                let sourceMap = true;
                if (emitDeclarationOnly) {
                    sourceMap = false;
                } else if (tsConfigInfo?.compilerOptions.sourceMap != null) {
                    sourceMap = tsConfigInfo?.compilerOptions.sourceMap;
                } else if (tsConfigInfo?.compilerOptions.inlineSourceMap != null) {
                    sourceMap = tsConfigInfo?.compilerOptions.inlineSourceMap;
                }

                // externals
                const { externals, globals } = this.getExternalsAndGlobals({
                    compilation: null,
                    packageJsonInfo
                });

                parsedScriptCompilations.push({
                    entry,
                    compiler: emitDeclarationOnly ?? !entryPoints ? 'tsc' : 'esbuild',
                    _entryPoints: entryPoints,
                    _outDir: this.options.buildTask.outDir,
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: emitDeclarationOnly,
                    _declaration: declaration,
                    _sourceMap: sourceMap,
                    _preserveSymlinks: preserveSymlinks,
                    _bundle: emitDeclarationOnly ?? !entryPoints ? false : true,
                    _minify: minify,
                    _environmentTargets: this.options.scriptOptions.environmentTargets,
                    _externals: [...externals],
                    _globals: globals,
                    _assetLoaders: undefined,
                    _assetOut: undefined,
                    _globalName: undefined,
                    _treeshake: undefined
                });
            }

            return parsedScriptCompilations;
        } else {
            if (this.options.scriptOptions.compilations.length === 0) {
                throw new InvalidConfigError(
                    `No compilation options. Specify 'compilations' values in script options.`,
                    configPath,
                    `${this.configLocationPrefix}/scriptOptions/compilations`
                );
            }

            const parsedScriptCompilations: ParsedCompilation[] = [];

            for (let i = 0; i < this.options.scriptOptions.compilations.length; i++) {
                const compilation = this.options.scriptOptions.compilations[i];

                if (Object.keys(compilation).length === 0) {
                    throw new InvalidConfigError(
                        'Empty compilation options found.',
                        configPath,
                        `${this.configLocationPrefix}/compilations/${i}`
                    );
                }

                const tsConfigPath = await this.getTsConfigPath({
                    compilation,
                    compilationIndex: i
                });

                const tsConfigInfo = tsConfigPath
                    ? await this.getTsConfigInfo({
                          compilation,
                          compilationIndex: i,
                          tsConfigPath
                      })
                    : undefined;

                const entryPoints = await this.getEntryPoints({
                    compilation,
                    compilationIndex: i,
                    tsConfigInfo,
                    packageJsonInfo
                });

                const scriptTarget = this.getScriptTarget({
                    compilation,
                    tsConfigInfo
                });

                const moduleFormat = this.getModuleFormat({
                    compilation,
                    tsConfigInfo,
                    entryPoints,
                    packageJsonInfo
                });

                // emitDeclarationOnly
                let emitDeclarationOnly: boolean | undefined;
                if (compilation.compiler === 'tsc' && compilation.emitDeclarationOnly != null) {
                    emitDeclarationOnly = compilation.emitDeclarationOnly;
                } else if (tsConfigInfo?.compilerOptions.emitDeclarationOnly != null) {
                    emitDeclarationOnly = tsConfigInfo.compilerOptions.emitDeclarationOnly;
                }

                // declaration
                let declaration: boolean | undefined;
                if (compilation.compiler === 'tsc' && compilation.declaration != null) {
                    declaration = compilation.declaration;
                } else if (emitDeclarationOnly) {
                    declaration = true;
                } else if (tsConfigInfo?.compilerOptions.declaration != null) {
                    declaration = tsConfigInfo.compilerOptions.declaration;
                }

                // bundle
                let bundle = emitDeclarationOnly ? false : undefined;
                if (compilation.compiler === 'tsc') {
                    bundle = false;
                } else if (compilation.compiler === 'esbuild' && compilation.bundle != null) {
                    bundle = compilation.bundle;
                } else if (compilation.compiler === 'rollup' || compilation.compiler === 'webpack') {
                    bundle = true;
                }

                // environmentTargets
                const environmentTargets: string[] =
                    compilation.environmentTargets ?? this.options.scriptOptions.environmentTargets ?? [];

                // minify
                let minify: boolean | undefined;
                if (compilation.minify != null) {
                    minify = compilation.minify;
                } else {
                    if (bundle && (moduleFormat === 'iife' || moduleFormat === 'umd') && !emitDeclarationOnly) {
                        minify = true;
                    }
                }

                // sourceMap
                let sourceMap = emitDeclarationOnly ? false : true;
                if (compilation.sourceMap != null) {
                    sourceMap = compilation.sourceMap;
                } else if (!emitDeclarationOnly && tsConfigInfo?.compilerOptions.inlineSourceMap != null) {
                    sourceMap = tsConfigInfo?.compilerOptions.inlineSourceMap;
                } else if (!emitDeclarationOnly && tsConfigInfo?.compilerOptions.sourceMap != null) {
                    sourceMap = tsConfigInfo?.compilerOptions.sourceMap;
                }

                // externals
                let externals: string[] | undefined;
                let globals: Record<string, string> | undefined;

                if (
                    compilation.compiler === 'esbuild' ||
                    compilation.compiler === 'rollup' ||
                    compilation.compiler === 'webpack'
                ) {
                    const externalsAndGlobalsOptions = this.getExternalsAndGlobals({
                        compilation,
                        packageJsonInfo
                    });

                    externals = externalsAndGlobalsOptions.externals;
                    globals = externalsAndGlobalsOptions.globals;
                }

                // preserveSymlinks
                const preserveSymlinks =
                    this.options.scriptOptions.preserveSymlinks ?? tsConfigInfo?.compilerOptions.preserveSymlinks;

                parsedScriptCompilations.push({
                    entry: compilation.entry,
                    compiler: compilation.compiler,
                    _entryPoints: entryPoints,
                    _outDir: compilation.outDir
                        ? path.resolve(this.options.buildTask.outDir, compilation.outDir)
                        : this.options.buildTask.outDir,
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: emitDeclarationOnly,
                    _declaration: declaration,
                    _bundle: bundle,
                    _minify: minify,
                    _sourceMap: sourceMap,
                    _environmentTargets: [...environmentTargets],
                    _externals: externals ? [...externals] : undefined,
                    _globals: globals,
                    _preserveSymlinks: preserveSymlinks,

                    _assetLoaders: compilation.assetLoaders,
                    _assetOut: compilation.assetOut,
                    _globalName: compilation.globalName,
                    _treeshake: compilation.treeshake
                });
            }

            return parsedScriptCompilations;
        }
    }

    private async getTsConfigInfo(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation> | null;
            compilationIndex: number | null;
            tsConfigPath: string;
        }>
    ): Promise<TsConfigInfo> {
        const { projectRoot, configPath } = this.options.buildTask;
        const { compilation, compilationIndex, tsConfigPath } = options;

        const locationKey = `${projectRoot}!${this.configLocationPrefix}/compilations/${compilationIndex ?? 0}`;
        const cacheData = tsConfigInfoCache.get(tsConfigPath);
        if (cacheData) {
            if (cacheData.locationKey === locationKey) {
                return cacheData.tsConfigInfo;
            } else {
                return JSON.parse(JSON.stringify(cacheData.tsConfigInfo)) as TsConfigInfo;
            }
        }

        const configLocation = compilation?.tsconfig
            ? `${this.configLocationPrefix}/compilations/${compilationIndex ?? 0}/tsconfig`
            : `${this.configLocationPrefix}/tsconfig`;

        const jsonText = await fs.readFile(tsConfigPath, 'utf-8');

        const configJson = ts.parseConfigFileTextToJson(tsConfigPath, jsonText);

        if (!configJson.config || configJson.error) {
            const tsMsg = configJson.error
                ? '\n' + ts.flattenDiagnosticMessageText(configJson.error.messageText, '\n').trim()
                : '';
            const tsConfigPathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), tsConfigPath));

            throw new InvalidConfigError(
                `Invalid tsconfig file ${tsConfigPathRel}.${tsMsg}`,
                configPath,
                configLocation
            );
        }

        const parsedConfig = ts.parseJsonConfigFileContent(configJson.config, ts.sys, path.dirname(tsConfigPath));

        if (parsedConfig.errors.length) {
            const tsMsg = parsedConfig.errors
                .map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n').trim())
                .join('\n');

            const tsConfigPathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), tsConfigPath));

            throw new InvalidConfigError(
                `Invalid tsconfig file ${tsConfigPathRel}.${tsMsg}`,
                configPath,
                configLocation
            );
        }

        const tsConfigInfo: TsConfigInfo = {
            configPath: tsConfigPath,
            fileNames: parsedConfig.fileNames,
            compilerOptions: parsedConfig.options
        };

        tsConfigInfoCache.set(tsConfigPath, {
            locationKey,
            tsConfigInfo
        });

        return tsConfigInfo;
    }

    private async getTsConfigPath(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation>;
            compilationIndex: number;
        }>
    ): Promise<string | null> {
        const { projectRoot, configPath } = this.options.buildTask;
        const { compilation, compilationIndex } = options;

        const tsConfigFile = compilation?.tsconfig ?? this.options.scriptOptions.tsconfig;

        if (tsConfigFile) {
            const configLocation = compilation?.tsconfig
                ? `${this.configLocationPrefix}/compilations/${compilationIndex}/tsconfig`
                : `${this.configLocationPrefix}/tsconfig`;

            const normalizedTsConfigFile = normalizePathToPOSIXStyle(tsConfigFile);
            const cacheKey = `${projectRoot}!${normalizedTsConfigFile}`;
            const cachedPath = tsConfigPathsCache.get(cacheKey);
            if (cachedPath) {
                return cachedPath;
            }

            if (
                !normalizedTsConfigFile ||
                normalizedTsConfigFile.length < 6 ||
                !/\.json$/i.test(normalizedTsConfigFile)
            ) {
                throw new InvalidConfigError(`Invalid tsconfig file ${tsConfigFile}.`, configPath, configLocation);
            }

            const tsConfigFilePath = resolvePath(projectRoot, normalizedTsConfigFile);

            if (!(await pathExists(tsConfigFilePath, true))) {
                throw new InvalidConfigError(
                    `The tsconfig file ${tsConfigFile} doesn't exist.`,
                    configPath,
                    configLocation
                );
            }

            tsConfigPathsCache.set(cacheKey, tsConfigFilePath);

            return tsConfigFilePath;
        }

        this.logger.debug(`Detecting tsconfig file for compilation/${compilationIndex}...`);

        const detectedTsConfigFilePath = await this.detectTsConfigPath();

        if (detectedTsConfigFilePath) {
            this.logger.debug(
                `Tsconfig file detected: ${normalizePathToPOSIXStyle(
                    path.relative(process.cwd(), detectedTsConfigFilePath)
                )}`
            );
        }

        return detectedTsConfigFilePath;
    }

    private async detectTsConfigPath(): Promise<string | null> {
        const { workspaceRoot, projectRoot } = this.options.buildTask;

        const cacheKey = projectRoot;
        const cachedPath = tsConfigPathsCache.get(cacheKey);
        if (cachedPath !== undefined) {
            return cachedPath.length ? cachedPath : null;
        }

        const configFiles = [
            'tsconfig.build.json',
            'tsconfig-build.json',
            'tsconfig.lib.json',
            'tsconfig-lib.json',
            'tsconfig.json'
        ];

        let foundPath: string | null = null;

        for (const configFile of configFiles) {
            foundPath = await findUp(configFile, projectRoot, workspaceRoot, true);

            if (foundPath) {
                break;
            }
        }

        if (foundPath) {
            tsConfigPathsCache.set(cacheKey, foundPath);
        } else {
            tsConfigPathsCache.set(cacheKey, '');
        }

        return foundPath;
    }

    private async resolveEntryFilePath(entry: string, compilationIndex: number): Promise<string> {
        const { projectRoot, projectName, configPath } = this.options.buildTask;

        const configLocation = `${this.configLocationPrefix}/compilations/${compilationIndex}/entry`;

        const normalizedEntry = normalizePathToPOSIXStyle(entry);

        if (
            !normalizedEntry ||
            normalizedEntry.length < 4 ||
            !/\.(tsx|mts|cts|ts|jsx|mjs|cjs|js)$/i.test(normalizedEntry)
        ) {
            const errMsg = `Unsupported script entry file extension '${entry}'.`;
            if (projectName) {
                throw new InvalidConfigError(errMsg, configPath, configLocation);
            } else {
                throw new InvalidCommandOptionError('script', entry, errMsg);
            }
        }

        const entryFilePath = resolvePath(projectRoot, normalizedEntry);

        if (!(await pathExists(entryFilePath, true))) {
            const errMsg = `The entry file ${entry} doesn't exist.`;
            if (projectName) {
                throw new InvalidConfigError(errMsg, configPath, configLocation);
            } else {
                throw new InvalidCommandOptionError('script', entry, errMsg);
            }
        }

        return entryFilePath;
    }

    private async getEntryPoints(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation>;
            compilationIndex: number;
            tsConfigInfo: Readonly<TsConfigInfo> | undefined;
            packageJsonInfo: Readonly<PackageJsonInfo> | null;
        }>
    ): Promise<string[] | Record<string, string> | undefined> {
        const { compilation, compilationIndex, tsConfigInfo, packageJsonInfo } = options;

        if (compilation.entry) {
            if (Array.isArray(compilation.entry) || typeof compilation.entry === 'string') {
                const enties = Array.isArray(compilation.entry) ? [...compilation.entry] : [compilation.entry];
                const entryFilePaths: string[] = [];
                for (const entry of enties) {
                    const entryFilePath = await this.resolveEntryFilePath(entry, compilationIndex);
                    entryFilePaths.push(entryFilePath);
                }

                return entryFilePaths;
            } else {
                for (const outName of Object.keys(compilation.entry)) {
                    const entry = compilation.entry[outName];
                    const entryFilePath = await this.resolveEntryFilePath(entry, compilationIndex);
                    compilation.entry[outName] = entryFilePath;
                }

                return compilation.entry;
            }
        }

        this.logger.debug(`Detecting entry file for compilation/${compilationIndex}...`);

        const detectedEntryFilePath = await this.detectEntryFilePath({
            tsConfigInfo,
            packageJsonInfo
        });

        if (detectedEntryFilePath) {
            this.logger.debug(
                `Entry file detected: ${normalizePathToPOSIXStyle(path.relative(process.cwd(), detectedEntryFilePath))}`
            );

            return [detectedEntryFilePath];
        }

        return undefined;
    }

    private async detectEntryFilePath(
        options: Readonly<{
            tsConfigInfo: Readonly<TsConfigInfo> | undefined;
            packageJsonInfo: Readonly<PackageJsonInfo> | null;
        }>
    ): Promise<string | undefined> {
        const { projectRoot } = this.options.buildTask;
        const { tsConfigInfo, packageJsonInfo } = options;

        const cacheKey = projectRoot;
        const cached = entryFilePathsCache.get(cacheKey);
        if (cached !== undefined) {
            return cached?.length ? cached : undefined;
        }

        const lastPartPackageName = packageJsonInfo?.packageName
            ? getLastPartPackageName(packageJsonInfo.packageName)
            : null;

        const searchFileNames = ['index', 'public-api', 'public_api'];
        if (lastPartPackageName) {
            searchFileNames.push(lastPartPackageName);
        }
        searchFileNames.push('main');

        const searchDirs = [projectRoot, path.resolve(projectRoot, 'src'), path.resolve(projectRoot, 'lib')];

        let searchExtNames = ['.mts', '.cts', '.tsx', '.ts', '.mjs', '.cjs', '.jsx', '.js'];
        if (lastDetectectedEntryFileExt) {
            searchExtNames = searchExtNames.filter((e) => e !== lastDetectectedEntryFileExt);
            searchExtNames.unshift(lastDetectectedEntryFileExt);
        }

        const foundPath = await searchFileByExtensions(
            searchExtNames,
            searchFileNames,
            searchDirs,
            tsConfigInfo?.fileNames
        );

        if (foundPath) {
            lastDetectectedEntryFileExt = path.extname(foundPath);
            entryFilePathsCache.set(cacheKey, foundPath);

            return foundPath;
        } else {
            entryFilePathsCache.set(cacheKey, '');

            return undefined;
        }
    }

    // TODO:
    // private async getOutputFilePath(
    //     options: Readonly<{
    //         compilation: Readonly<ScriptCompilation>;
    //         compilationIndex: number | undefined;
    //         entryFilePath: string | undefined;
    //         forTypesOutput: boolean;
    //         bundle: boolean;
    //         moduleFormat: ScriptModuleFormat | undefined;
    //         tsConfigInfo: Readonly<TsConfigInfo> | undefined;
    //         packageJsonInfo: Readonly<PackageJsonInfo> | null;
    //     }>
    // ): Promise<string | undefined> {
    //     const { compilation, compilationIndex, entryFilePath, forTypesOutput, tsConfigInfo, packageJsonInfo } = options;

    //     if (!entryFilePath) {
    //         return undefined;
    //     }

    //     const { configPath, outDir, workspaceRoot, projectRoot } = this.options.buildTask;

    //     const lastPartPackageName = packageJsonInfo?.packageName
    //         ? getLastPartPackageName(packageJsonInfo.packageName)
    //         : null;

    //     const entryFileName = path.basename(entryFilePath);
    //     const entryFileExt = path.extname(entryFileName);
    //     const entryFileNameWithoutExt = entryFileName.substring(0, entryFileName.length - entryFileExt.length);

    //     if (compilation.out?.trim().length) {
    //         const configLocation = `${this.configLocationPrefix}/compilations/${compilationIndex}/out`;

    //         let outFilePath: string;

    //         let normalizedOut = normalizePathToPOSIXStyle(compilation.out);
    //         const normalizedOutExt = path.extname(normalizedOut);

    //         normalizedOut = normalizedOut.replace(/\[name\]/gi, entryFileNameWithoutExt);
    //         if (lastPartPackageName) {
    //             normalizedOut = normalizedOut.replace(/\[package_?name\]/gi, lastPartPackageName);
    //         }

    //         if (
    //             !compilation.out?.trim().endsWith('/') &&
    //             normalizedOutExt &&
    //             /^\.(d\.[cm]?ts|mjs|cjs|jsx?)$/i.test(normalizedOutExt)
    //         ) {
    //             // Validation
    //             //
    //             if (forTypesOutput) {
    //                 if (!/^\.d\.[cm]?ts$/i.test(normalizedOutExt)) {
    //                     throw new InvalidConfigError(
    //                         'Invalid file extension for declaration output.',
    //                         configPath,
    //                         configLocation
    //                     );
    //                 }
    //             } else {
    //                 if (/^\.d\.[cm]?ts$/i.test(normalizedOutExt)) {
    //                     throw new InvalidConfigError(
    //                         'Invalid file extension for non-declaration output.',
    //                         configPath,
    //                         configLocation
    //                     );
    //                 }
    //             }

    //             outFilePath = resolvePath(outDir, normalizedOut);
    //         } else {
    //             if (compilationIndex != null) {
    //                 this.logger.debug(`Detecting output file name for compilation/${compilationIndex}...`);
    //             } else {
    //                 this.logger.debug('Detecting output file name...');
    //             }

    //             const outFileName = await this.detectOutputFileName(options);

    //             if (!outFileName) {
    //                 return undefined;
    //             }

    //             this.logger.debug(`Output file detected: ${outFileName}`);

    //             outFilePath = resolvePath(outDir, path.join(normalizedOut, outFileName));
    //         }

    //         if (isSamePath(outFilePath, entryFilePath)) {
    //             throw new InvalidConfigError(
    //                 'The compilation output path must not be the same as entry file path.',
    //                 configPath,
    //                 configLocation
    //             );
    //         }

    //         if (!isInFolder(outDir, outFilePath)) {
    //             throw new InvalidConfigError(
    //                 'The compilation output path must not be outside of project outDir.',
    //                 configPath,
    //                 configLocation
    //             );
    //         }

    //         return outFilePath;
    //     } else {
    //         if (compilationIndex != null) {
    //             this.logger.debug(`Detecting output file name for compilation/${compilationIndex}...`);
    //         } else {
    //             this.logger.debug('Detecting output file name...');
    //         }

    //         const outFileName = await this.detectOutputFileName(options);

    //         if (!outFileName) {
    //             return undefined;
    //         }

    //         this.logger.debug(`Output file detected: ${outFileName}`);

    //         let customOutDir = outDir;

    //         if (
    //             tsConfigInfo?.configPath &&
    //             tsConfigInfo?.compilerOptions.outDir != null &&
    //             isInFolder(projectRoot, tsConfigInfo.configPath) &&
    //             (isInFolder(outDir, tsConfigInfo.compilerOptions.outDir) ||
    //                 isSamePath(outDir, tsConfigInfo.compilerOptions.outDir))
    //         ) {
    //             customOutDir = path.resolve(tsConfigInfo.compilerOptions.outDir);
    //         } else if (!isSamePath(projectRoot, workspaceRoot)) {
    //             const relToWorkspaceRoot = normalizePathToPOSIXStyle(path.relative(workspaceRoot, projectRoot));
    //             if (relToWorkspaceRoot.split('/').length > 1) {
    //                 customOutDir = resolvePath(outDir, relToWorkspaceRoot);
    //             }
    //         }

    //         const outputPath = resolvePath(customOutDir, outFileName);

    //         return outputPath;
    //     }
    // }

    // private async detectOutputFileName(
    //     options: Readonly<{
    //         entryPoints: string[] | Record<string, string> | undefined;
    //         forTypesOutput: boolean;
    //         bundle: boolean | undefined;
    //         moduleFormat: ScriptModuleFormat | undefined;
    //         packageJsonInfo: Readonly<PackageJsonInfo> | null;
    //     }>
    // ): Promise<string | undefined> {
    //     const { entryPoints, forTypesOutput, moduleFormat, bundle, packageJsonInfo } = options;

    //     if (!entryPoints) {
    //         return undefined;
    //     }

    //     let entryFilePath: string | undefined;
    //     if (Array.isArray(entryPoints)) {
    //         if (entryPoints.length > 1) {
    //             return undefined;
    //         }

    //         entryFilePath = entryPoints[0];
    //     } else {
    //         return undefined;
    //     }

    //     if (!entryFilePath) {
    //         return undefined;
    //     }

    //     if (packageJsonInfo?.packageJsonConfig) {
    //         const packageJsonConfig = packageJsonInfo.packageJsonConfig;

    //         let entryFromPackageJson: string | undefined;

    //         if (forTypesOutput) {
    //             if (packageJsonConfig.exports && typeof packageJsonConfig.exports === 'object') {
    //                 const exports = packageJsonConfig.exports as Record<
    //                     string,
    //                     | {
    //                           types?: unknown;
    //                           import?: string | { types?: unknown };
    //                           require?: string | { types?: unknown };
    //                       }
    //                     | undefined
    //                 >;

    //                 if (
    //                     moduleFormat === 'esm' &&
    //                     exports['.']?.import &&
    //                     typeof exports['.'].import === 'object' &&
    //                     exports['.'].import.types &&
    //                     typeof exports['.'].import.types === 'string'
    //                 ) {
    //                     entryFromPackageJson = exports['.'].import.types.trim();
    //                 } else if (
    //                     moduleFormat === 'cjs' &&
    //                     exports['.']?.require &&
    //                     typeof exports['.'].require === 'object' &&
    //                     exports['.'].require.types &&
    //                     typeof exports['.'].require.types === 'string'
    //                 ) {
    //                     entryFromPackageJson = exports['.'].require.types.trim();
    //                 } else if (exports['.']?.types && typeof exports['.'].types === 'string') {
    //                     entryFromPackageJson = exports['.']?.types.trim();
    //                 }
    //             }

    //             if (!entryFromPackageJson && packageJsonConfig.types && typeof packageJsonConfig.types === 'string') {
    //                 entryFromPackageJson = packageJsonConfig.types.trim();
    //             }

    //             if (
    //                 !entryFromPackageJson &&
    //                 packageJsonConfig.typings &&
    //                 typeof packageJsonConfig.typings === 'string'
    //             ) {
    //                 entryFromPackageJson = packageJsonConfig.typings.trim();
    //             }
    //         } else {
    //             if (packageJsonConfig.exports && typeof packageJsonConfig.exports === 'object') {
    //                 const exports = packageJsonConfig.exports as Record<
    //                     string,
    //                     | {
    //                           import?: string | { default?: unknown };
    //                           require?: string | { default?: unknown };
    //                           esm?: unknown;
    //                           default?: unknown;
    //                       }
    //                     | undefined
    //                 >;

    //                 if (
    //                     moduleFormat === 'esm' &&
    //                     exports['.']?.import &&
    //                     typeof exports['.'].import === 'object' &&
    //                     exports['.'].import.default &&
    //                     typeof exports['.'].import.default === 'string'
    //                 ) {
    //                     entryFromPackageJson = exports['.'].import.default.trim();
    //                 } else if (
    //                     moduleFormat === 'cjs' &&
    //                     exports['.']?.require &&
    //                     typeof exports['.'].require === 'object' &&
    //                     exports['.'].require.default &&
    //                     typeof exports['.'].require.default === 'string'
    //                 ) {
    //                     entryFromPackageJson = exports['.'].require.default.trim();
    //                 }

    //                 if (!entryFromPackageJson && exports['.']?.default && typeof exports['.'].default === 'string') {
    //                     entryFromPackageJson = exports['.']?.default.trim();
    //                 }
    //             }

    //             if (!entryFromPackageJson && packageJsonConfig.module && typeof packageJsonConfig.module === 'string') {
    //                 entryFromPackageJson = packageJsonConfig.module.trim();
    //             }

    //             if (!entryFromPackageJson && packageJsonConfig.main && typeof packageJsonConfig.main === 'string') {
    //                 entryFromPackageJson = packageJsonConfig.main.trim();
    //             }
    //         }

    //         if (entryFromPackageJson) {
    //             const baseFileName = path.basename(normalizePathToPOSIXStyle(entryFromPackageJson));
    //             if (baseFileName && /\.(d\.[cm]?ts|mjs|cjs|jsx?)$/i.test(baseFileName)) {
    //                 return baseFileName;
    //             }
    //         }
    //     }

    //     const entryFileName = path.basename(entryFilePath);
    //     const entryFileExt = path.extname(entryFileName);
    //     const entryFileNameWithoutExt = entryFileName.substring(0, entryFileName.length - entryFileExt.length);

    //     let suggestedOutFileExt = '.js';
    //     if (forTypesOutput) {
    //         if (/^\.mts$/i.test(entryFileExt)) {
    //             suggestedOutFileExt = '.d.mts';
    //         } else if (/^\.cts$/i.test(entryFileExt)) {
    //             suggestedOutFileExt = '.d.cts';
    //         } else {
    //             suggestedOutFileExt = '.d.ts';
    //         }
    //     } else if (moduleFormat === 'esm' && /^\.m(t|j)s$/i.test(entryFileExt)) {
    //         suggestedOutFileExt = '.mjs';
    //     } else if (moduleFormat === 'cjs' && /^\.c(t|j)s$/i.test(entryFileExt)) {
    //         suggestedOutFileExt = '.cjs';
    //     } else if (/^\.(t|j)sx$/i.test(entryFileExt)) {
    //         suggestedOutFileExt = '.jsx';
    //     }

    //     const lastPartPackageName = packageJsonInfo?.packageName
    //         ? getLastPartPackageName(packageJsonInfo.packageName)
    //         : null;

    //     if (
    //         lastPartPackageName &&
    //         bundle &&
    //         lastPartPackageName.toLowerCase() !== entryFileNameWithoutExt.toLowerCase() &&
    //         entryFileNameWithoutExt.toLocaleLowerCase() !== 'index'
    //     ) {
    //         const searchExtNames = ['.mts', '.cts', '.ts', '.tsx', '.mjs', '.cjs', '.js', '.jsx'];
    //         const entryRoot = path.dirname(entryFilePath);

    //         for (const extName of searchExtNames) {
    //             const fileNameWithExt = lastPartPackageName + extName;
    //             const found = await findUp(
    //                 fileNameWithExt,
    //                 [path.resolve(entryRoot, 'src'), path.resolve(entryRoot, 'lib')],
    //                 entryRoot,
    //                 true
    //             );

    //             if (found) {
    //                 return lastPartPackageName + suggestedOutFileExt;
    //             }
    //         }
    //     }

    //     return entryFileNameWithoutExt + suggestedOutFileExt;
    // }

    private getScriptTarget(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation> | null;
            tsConfigInfo: Readonly<TsConfigInfo> | undefined;
        }>
    ): ScriptTarget | undefined {
        const { compilation, tsConfigInfo } = options;

        if (compilation?.scriptTarget) {
            return compilation.scriptTarget;
        }

        if (tsConfigInfo?.compilerOptions.target) {
            return ts.ScriptTarget[tsConfigInfo.compilerOptions.target] as ScriptTarget;
        }

        return undefined;
    }

    private getModuleFormat(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation> | null;
            tsConfigInfo: Readonly<TsConfigInfo> | undefined;
            entryPoints: string[] | Record<string, string> | undefined;
            packageJsonInfo: Readonly<PackageJsonInfo> | null;
        }>
    ): ScriptModuleFormat | undefined {
        const { compilation, tsConfigInfo, packageJsonInfo, entryPoints } = options;

        if (compilation?.moduleFormat) {
            return compilation.moduleFormat;
        }

        if (tsConfigInfo?.compilerOptions.module != null) {
            const moduleKind = tsConfigInfo.compilerOptions.module;
            if (moduleKind === ts.ModuleKind.CommonJS) {
                return 'cjs';
            }

            if (moduleKind === ts.ModuleKind.UMD || moduleKind === ts.ModuleKind.AMD) {
                return 'umd';
            }

            if (moduleKind == null || moduleKind === ts.ModuleKind.None || moduleKind === ts.ModuleKind.System) {
                return 'iife';
            }

            if (moduleKind > ts.ModuleKind.System) {
                return 'esm';
            }
        }

        if (packageJsonInfo?.packageJsonConfig.type === 'module') {
            return 'esm';
        }

        const environmentTargets: string[] =
            compilation?.environmentTargets ?? this.options.scriptOptions.environmentTargets ?? [];

        let entryFilePaths: string[] = [];
        if (entryPoints) {
            if (Array.isArray(entryPoints)) {
                entryFilePaths = [...entryPoints];
            } else {
                for (const [outName, entry] of Object.entries(entryPoints)) {
                    const outExt = path.extname(outName);

                    if (outExt && /\.cjs$/i.test(outExt)) {
                        return 'cjs';
                    }

                    if (outExt && /\.mjs$/i.test(outExt)) {
                        return 'esm';
                    }

                    entryFilePaths.push(entry);
                }
            }
        } else if (tsConfigInfo?.fileNames) {
            entryFilePaths = [...tsConfigInfo.fileNames];
        }

        for (const entryFilePath of entryFilePaths) {
            if (
                /\.c[tj]s$/i.test(entryFilePath) ||
                (!environmentTargets.includes('web') &&
                    !environmentTargets.includes('browser') &&
                    environmentTargets.some((e) => e.startsWith('node')) &&
                    tsConfigInfo?.compilerOptions.moduleResolution !== ts.ModuleResolutionKind.NodeNext &&
                    tsConfigInfo?.compilerOptions.moduleResolution !== ts.ModuleResolutionKind.Node16 &&
                    !/\.m[tj]s$/i.test(entryFilePath))
            ) {
                return 'cjs';
            }

            if (/\.m[tj]s$/i.test(entryFilePath)) {
                return 'esm';
            }
        }

        if (
            (environmentTargets.includes('web') || environmentTargets.includes('browser') || packageJsonInfo == null) &&
            !environmentTargets.some((e) => e.startsWith('node')) &&
            tsConfigInfo?.compilerOptions.moduleResolution !== ts.ModuleResolutionKind.NodeNext &&
            tsConfigInfo?.compilerOptions.moduleResolution !== ts.ModuleResolutionKind.Node16
        ) {
            return 'iife';
        }

        if (
            tsConfigInfo?.compilerOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext ||
            tsConfigInfo?.compilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16
        ) {
            return 'esm';
        }

        return undefined;
    }

    private getExternalsAndGlobals(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation> | null;
            packageJsonInfo: Readonly<PackageJsonInfo> | null;
        }>
    ): {
        externals: string[];
        globals: Record<string, string>;
    } {
        const { compilation, packageJsonInfo } = options;

        const globals: Record<string, string> = {};
        const externals: string[] = ['tslib'];
        const excludes = compilation?.externalExclude ?? this.options.scriptOptions.externalExclude ?? [];

        if (this.options.scriptOptions.packageDependenciesAsExternals !== false) {
            if (packageJsonInfo?.packageJsonConfig?.devDependencies) {
                Object.keys(packageJsonInfo.packageJsonConfig.devDependencies)
                    .filter((e) => !externals.includes(e) && !excludes.includes(e))
                    .forEach((e) => {
                        externals.push(e);
                    });
            }

            if (packageJsonInfo?.packageJsonConfig?.dependencies) {
                Object.keys(packageJsonInfo.packageJsonConfig.dependencies)
                    .filter((e) => !externals.includes(e) && !excludes.includes(e))
                    .forEach((e) => {
                        externals.push(e);
                    });
            }

            if (packageJsonInfo?.packageJsonConfig?.peerDependencies) {
                Object.keys(packageJsonInfo.packageJsonConfig.peerDependencies)
                    .filter((e) => !externals.includes(e) && !excludes.includes(e))
                    .forEach((e) => {
                        externals.push(e);
                    });
            }

            if (packageJsonInfo?.packageJsonConfig?.optionalDependencies) {
                Object.keys(packageJsonInfo.packageJsonConfig.optionalDependencies)
                    .filter((e) => !externals.includes(e) && !excludes.includes(e))
                    .forEach((e) => {
                        externals.push(e);
                    });
            }
        }

        if (this.options.scriptOptions.externals?.length) {
            for (const e of this.options.scriptOptions.externals) {
                if (typeof e === 'string') {
                    if (!externals.includes(e) && !excludes.includes(e)) {
                        externals.push(e);
                    }
                } else {
                    for (const [externalKey, globalName] of Object.entries(e)) {
                        if (!externals.includes(externalKey) && !excludes.includes(externalKey)) {
                            externals.push(externalKey);
                        }

                        globals[externalKey] = globalName;
                    }
                }
            }
        }

        for (const externalkey of externals) {
            if (globals[externalkey]) {
                continue;
            }

            let globalName = externalkey.replace(/\//g, '.');

            if (globalName.startsWith('@')) {
                globalName = globalName.substring(1);
            }

            if (globalName.startsWith('angular')) {
                globalName = globalName.replace(/^angular/, 'ng');
            } else if (globalName === 'jquery') {
                globalName = '$';
            } else if (globalName === 'lodash') {
                globalName = '_';
            }

            globalName = dashToCamelCase(globalName);

            globals[externalkey] = globalName;
        }

        return {
            externals,
            globals
        };
    }
}

export function getScriptTaskRunner(
    buildTask: Readonly<BuildTask>,
    context: Readonly<HandlerOptions>
): ScriptTaskRunner | null {
    if (!buildTask.script) {
        return null;
    }

    let scriptOptions: ScriptOptions = {
        compilations: []
    };

    if (Array.isArray(buildTask.script)) {
        const entries: string[] = [];

        for (const input of buildTask.script) {
            const trimedInput = input.trim();
            if (!trimedInput) {
                continue;
            }

            if (!entries.includes(trimedInput)) {
                entries.push(trimedInput);
            }
        }

        scriptOptions.compilations = [
            {
                compiler: 'esbuild',
                entry: entries
            }
        ];
    } else {
        scriptOptions = {
            ...buildTask.script
        };
    }

    if (
        !scriptOptions.compilations ||
        (Array.isArray(scriptOptions.compilations) && scriptOptions.compilations.length === 0)
    ) {
        return null;
    }

    const taskRunner = new ScriptTaskRunner({
        scriptOptions,
        buildTask,
        logger: context.logger,
        logLevel: context.logLevel,
        dryRun: context.dryRun,
        env: context.env
    });

    return taskRunner;
}
