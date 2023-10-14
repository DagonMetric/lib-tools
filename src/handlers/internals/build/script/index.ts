import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// import defaultTs from 'typescript';

import {
    ScriptCompilation,
    ScriptModuleFormat,
    ScriptOptions,
    ScriptTargetStrings
} from '../../../../config-models/index.js';
import { LogLevelStrings, LoggerBase, colors } from '../../../../utils/index.js';
import {
    dashCaseToCamelCase,
    findUp,
    isInFolder,
    isSamePath,
    normalizePathToPOSIXStyle,
    pathExists,
    resolvePath
} from '../../../../utils/internals/index.js';

import { BuildTask } from '../../../build-task.js';
import { CompilationError, InvalidCommandOptionError, InvalidConfigError } from '../../../exceptions/index.js';
import { HandlerOptions } from '../../../handler-options.js';

import { getBannerOptions } from '../../get-banner-options.js';
import { PackageJsonInfo, getPackageJsonInfo } from '../../get-package-json-info.js';
import { getSubstitutions } from '../../get-substitutions.js';

import { CompileOptions, CompileResult, TsConfigInfo } from './compilers/interfaces.js';
import { setTypescriptModule, ts } from './compilers/tsproxy.js';

export type CompilerFn = (options: CompileOptions, logger: LoggerBase) => Promise<CompileResult>;

const tsConfigPathsCache = new Map<string, string>();
const tsConfigInfoCache = new Map<string, { locationKey: string; tsConfigInfo: TsConfigInfo }>();
const entryFilePathsCache = new Map<string, string>();
const compilerCache = new Map<string, CompilerFn>();
let lastDetectectedEntryFileExt: string | null = null;

const require = createRequire(process.cwd() + '/');

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
setTypescriptModule(require('typescript'));

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

function getYearFromScriptTarget(scriptTarget: ScriptTargetStrings): number {
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

interface ParsedCompilation extends ScriptCompilation {
    readonly _entryFilePath: string;
    readonly _outFilePath: string;
    readonly _moduleFormat: ScriptModuleFormat;
    readonly _scriptTarget: ScriptTargetStrings;
    readonly _bundle: boolean;
    readonly _sourceMap: boolean;
    readonly _minify: boolean;
    readonly _environmentTargets: readonly string[] | undefined;
    readonly _externals: readonly string[] | undefined;
    readonly _tsConfigInfo: Readonly<TsConfigInfo> | undefined;
    readonly _declaration: boolean | undefined;
    readonly _emitDeclarationOnly: boolean | undefined;
    readonly _globals: Readonly<Record<string, string>> | undefined;
    readonly _preserveSymlinks: boolean | undefined;
}

/**
 * @internal
 */
export interface ScriptTaskRunnerOptions {
    readonly scriptOptions: Readonly<ScriptOptions>;
    readonly buildTask: Readonly<BuildTask>;
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings;
    readonly dryRun: boolean;
    readonly env: string | undefined;
}

/**
 * @internal
 */
export interface ScriptMainOutputAsset {
    readonly moduleFormat: ScriptModuleFormat;
    readonly outputFilePath: string;
    readonly size: number | undefined;
}

/**
 * @internal
 */
export interface ScriptResult {
    readonly mainOutputAssets: readonly ScriptMainOutputAsset[];
    readonly time: number;
}

/**
 * @internal
 */
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

        const substitutions = await getSubstitutions(scriptOptions.substitutions ?? [], this.options.buildTask);
        const bannerOptions = await getBannerOptions(
            'banner',
            'script',
            scriptOptions.banner,
            this.options.buildTask,
            substitutions
        );
        const footerOptions = await getBannerOptions(
            'footer',
            'script',
            scriptOptions.footer,
            this.options.buildTask,
            substitutions
        );

        const mainOutputAssets: ScriptMainOutputAsset[] = [];
        let totalTime = 0;
        const compilations = await this.getParsedCompilations();

        for (let i = 0; i < compilations.length; i++) {
            const compilation = compilations[i];

            if (compilations.length > 1) {
                this.logger.group(`\u25B7 compilations/${i}`);
            }

            const compileOptions: CompileOptions = {
                taskInfo: {
                    taskName,
                    workspaceRoot,
                    projectRoot,
                    projectName,
                    configPath,
                    compilationIndex: Array.isArray(this.options.scriptOptions.compilations) ? i : undefined
                },
                entryFilePath: compilation._entryFilePath,
                outFilePath: compilation._outFilePath,
                moduleFormat: compilation._moduleFormat,
                scriptTarget: compilation._scriptTarget,
                sourceMap: compilation._sourceMap,
                minify: compilation._minify,
                tsConfigInfo: compilation._tsConfigInfo,
                emitDeclarationOnly: compilation._emitDeclarationOnly,
                declaration: compilation._declaration,
                environmentTargets: compilation._environmentTargets,
                externals: compilation._externals,
                globals: compilation._globals,
                preserveSymlinks: compilation._preserveSymlinks,
                globalName: compilation.globalName,
                treeshake: compilation.treeshake,
                banner: bannerOptions,
                footer: footerOptions,
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
                    const compilerModule = await import('./compilers/tsc/index.js');
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
                    const compilerModule = await import('./compilers/rollup/index.js');
                    compilerFn = compilerModule.default;
                    compilerCache.set(cacheKey, compilerModule.default);
                }
            } else if (compilation.compiler?.toLowerCase().trim() === 'webpack') {
                const cacheKey = 'webpack';
                const cachefn = compilerCache.get(cacheKey);
                if (cachefn) {
                    compilerFn = cachefn;
                } else {
                    const compilerModule = await import('./compilers/webpack/index.js');
                    compilerFn = compilerModule.default;
                    compilerCache.set(cacheKey, compilerModule.default);
                }
            } else if (compilation.compiler?.toLowerCase().trim() === 'esbuild') {
                const cacheKey = 'esbuild';
                const cachefn = compilerCache.get(cacheKey);
                if (cachefn) {
                    compilerFn = cachefn;
                } else {
                    const compilerModule = await import('./compilers/esbuild/index.js');
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
            const mainOuputAsset = compileResult.builtAssets.find((a) =>
                isSamePath(a.path, compileOptions.outFilePath)
            );

            if (!mainOuputAsset) {
                const outputPathRel = normalizePathToPOSIXStyle(
                    path.relative(process.cwd(), compileOptions.outFilePath)
                );

                throw new CompilationError(
                    `${colors.lightRed(
                        'Error in compilation.'
                    )} The output file ${outputPathRel} could not be generated.`
                );
            }

            mainOutputAssets.push({
                moduleFormat: compileOptions.moduleFormat,
                outputFilePath: path.resolve(mainOuputAsset.path),
                size: mainOuputAsset.size
            });

            const builtAssetsCount = compileResult.builtAssets.length;
            const msgSuffix = this.options.dryRun ? 'built [dry run]' : 'emitted';
            const fileverb = builtAssetsCount > 1 ? 'files are' : 'file is';
            this.logger.info(`Total ${builtAssetsCount} ${fileverb} ${msgSuffix}.`);

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
            mainOutputAssets,
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

            const tsConfigPath = await this.detectTsConfigPath();
            const tsConfigInfo = tsConfigPath
                ? await this.getTsConfigInfo({ tsConfigPath, compilation: null, compilationIndex: null })
                : undefined;

            // TODO:
            const entryFilePath = await this.detectEntryFilePath({
                tsConfigInfo,
                packageJsonInfo
            });

            if (!entryFilePath) {
                throw new InvalidConfigError(
                    `Could not detect compilations automatically. Specify 'compilations' values in script options manually.`,
                    configPath,
                    `${this.configLocationPrefix}/compilations`
                );
            }

            const parsedScriptCompilations: ParsedCompilation[] = [];

            const entry = normalizePathToPOSIXStyle(path.relative(projectRoot, entryFilePath));
            const tsconfig = tsConfigInfo?.configPath
                ? normalizePathToPOSIXStyle(path.relative(projectRoot, tsConfigInfo.configPath))
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
                const typesCompilation: ScriptCompilation = {
                    bundle: false,
                    entry,
                    tsconfig,
                    scriptTarget,
                    moduleFormat,
                    emitDeclarationOnly: true,
                    declaration: true,
                    out: 'types'
                };

                const typesOutFilePath = await this.getOutputFilePath({
                    compilation: typesCompilation,
                    compilationIndex: undefined,
                    entryFilePath,
                    tsConfigInfo,
                    forTypesOutput: true,
                    bundle: false,
                    multiOutputsFormat: true,
                    moduleFormat,
                    scriptTarget,
                    packageJsonInfo
                });

                parsedScriptCompilations.push({
                    ...typesCompilation,
                    _entryFilePath: entryFilePath,
                    _outFilePath: typesOutFilePath,
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: true,
                    _declaration: true,
                    _bundle: false,
                    _sourceMap: false,
                    _minify: false,
                    _preserveSymlinks: preserveSymlinks,
                    _environmentTargets: undefined,
                    _externals: undefined,
                    _globals: undefined
                });

                // esm
                //
                const esmCompilation: ScriptCompilation = {
                    bundle: false,
                    entry,
                    tsconfig,
                    scriptTarget,
                    moduleFormat,
                    emitDeclarationOnly: false,
                    declaration: false,
                    sourceMap: true,
                    out: `esm${year}`
                };

                const esmOutFilePath = await this.getOutputFilePath({
                    compilation: esmCompilation,
                    compilationIndex: undefined,
                    entryFilePath,
                    tsConfigInfo,
                    forTypesOutput: false,
                    bundle: false,
                    multiOutputsFormat: true,
                    moduleFormat,
                    scriptTarget,
                    packageJsonInfo
                });

                parsedScriptCompilations.push({
                    ...esmCompilation,
                    _entryFilePath: entryFilePath,
                    _outFilePath: esmOutFilePath,
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: false,
                    _declaration: false,
                    _bundle: false,
                    _sourceMap: true,
                    _minify: false,
                    _preserveSymlinks: preserveSymlinks,
                    _environmentTargets: undefined,
                    _externals: undefined,
                    _globals: undefined
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

                const fesmCompilation: ScriptCompilation = {
                    bundle: true,
                    entry,
                    tsconfig,
                    scriptTarget,
                    moduleFormat,
                    emitDeclarationOnly: false,
                    declaration: false,
                    sourceMap: true,
                    minify: false,
                    out: `fesm${year}`
                };

                const fesmOutFilePath = await this.getOutputFilePath({
                    compilation: fesmCompilation,
                    compilationIndex: undefined,
                    entryFilePath,
                    forTypesOutput: false,
                    bundle: true,
                    multiOutputsFormat: true,
                    tsConfigInfo,
                    moduleFormat,
                    scriptTarget,
                    packageJsonInfo
                });

                parsedScriptCompilations.push({
                    ...fesmCompilation,
                    _entryFilePath: entryFilePath,
                    _outFilePath: fesmOutFilePath,
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: false,
                    _declaration: false,
                    _bundle: true,
                    _minify: false,
                    _sourceMap: true,
                    _environmentTargets: [...environmentTargets],
                    _externals: [...externals],
                    _globals: globals,
                    _preserveSymlinks: preserveSymlinks
                });
            } else {
                // emitDeclarationOnly
                let emitDeclarationOnly = false;
                if (tsConfigInfo?.compilerOptions.emitDeclarationOnly != null) {
                    emitDeclarationOnly = tsConfigInfo.compilerOptions.emitDeclarationOnly;
                }

                // declaration
                let declaration = false;
                if (emitDeclarationOnly) {
                    declaration = true;
                } else if (tsConfigInfo?.compilerOptions.declaration != null) {
                    declaration = tsConfigInfo.compilerOptions.declaration;
                }

                // moduleFormat
                let moduleFormat = this.getModuleFormat({
                    compilation: null,
                    tsConfigInfo,
                    entryFilePath,
                    packageJsonInfo
                });
                if (!moduleFormat) {
                    moduleFormat = emitDeclarationOnly ? 'esm' : 'iife';
                }

                let scriptTarget = this.getScriptTarget({
                    compilation: null,
                    tsConfigInfo
                });
                if (!scriptTarget) {
                    scriptTarget =
                        (moduleFormat === 'iife' || moduleFormat === 'umd') && !emitDeclarationOnly ? 'ES5' : 'ESNext';
                }

                const compilation: ScriptCompilation = {
                    bundle: true,
                    entry,
                    tsconfig,
                    emitDeclarationOnly,
                    declaration,
                    moduleFormat,
                    scriptTarget
                };

                const outFilePath = await this.getOutputFilePath({
                    compilation,
                    compilationIndex: undefined,
                    entryFilePath,
                    tsConfigInfo,
                    forTypesOutput: emitDeclarationOnly,
                    bundle: true,
                    multiOutputsFormat: false,
                    moduleFormat,
                    scriptTarget,
                    packageJsonInfo
                });

                // environmentTargets
                const environmentTargets: string[] = this.options.scriptOptions.environmentTargets ?? [];

                // minify
                const minify =
                    (moduleFormat === 'iife' || moduleFormat === 'umd') && !emitDeclarationOnly ? true : false;

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
                    ...compilation,
                    _entryFilePath: entryFilePath,
                    _outFilePath: outFilePath,
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: emitDeclarationOnly,
                    _declaration: declaration,
                    _bundle: true,
                    _sourceMap: sourceMap,
                    _minify: minify,
                    _environmentTargets: [...environmentTargets],
                    _externals: [...externals],
                    _globals: globals,
                    _preserveSymlinks: preserveSymlinks
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
            const multiOutputsFormat = this.options.scriptOptions.compilations.length > 0 ? true : false;

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
                const entryFilePath = await this.getEntryFilePath({
                    compilation,
                    compilationIndex: i,
                    tsConfigInfo,
                    packageJsonInfo
                });
                const scriptTarget =
                    this.getScriptTarget({
                        compilation,
                        tsConfigInfo
                    }) ?? 'ES2015';
                let moduleFormat = this.getModuleFormat({
                    compilation,
                    tsConfigInfo,
                    entryFilePath,
                    packageJsonInfo
                });

                if (!moduleFormat) {
                    if (!multiOutputsFormat) {
                        moduleFormat = 'umd';
                    } else {
                        throw new InvalidConfigError(
                            `Could not detect module format automatically. Specify 'moduleFormat' value in script compilations.`,
                            configPath,
                            `${this.configLocationPrefix}/compilations/${i}/moduleFormat`
                        );
                    }
                }

                // emitDeclarationOnly
                let emitDeclarationOnly = false;
                if (compilation.emitDeclarationOnly != null) {
                    emitDeclarationOnly = compilation.emitDeclarationOnly;
                } else if (tsConfigInfo?.compilerOptions.emitDeclarationOnly != null) {
                    emitDeclarationOnly = tsConfigInfo.compilerOptions.emitDeclarationOnly;
                }

                // declaration
                let declaration = false;
                if (compilation.declaration != null) {
                    declaration = compilation.declaration;
                } else if (emitDeclarationOnly) {
                    declaration = true;
                } else if (tsConfigInfo?.compilerOptions.declaration != null) {
                    declaration = tsConfigInfo.compilerOptions.declaration;
                }

                // bundle
                let bundle = emitDeclarationOnly ? false : true;
                if (compilation.bundle != null) {
                    bundle = compilation.bundle;
                }

                const outFilePath = await this.getOutputFilePath({
                    compilation,
                    compilationIndex: i,
                    entryFilePath,
                    tsConfigInfo,
                    forTypesOutput: emitDeclarationOnly,
                    bundle,
                    multiOutputsFormat: this.options.scriptOptions.compilations.length > 0 ? true : false,
                    moduleFormat,
                    scriptTarget,
                    packageJsonInfo
                });

                // environmentTargets
                const environmentTargets: string[] =
                    compilation.environmentTargets ?? this.options.scriptOptions.environmentTargets ?? [];

                // minify
                let minify = false;
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
                const { externals, globals } = this.getExternalsAndGlobals({
                    compilation,
                    packageJsonInfo
                });

                // preserveSymlinks
                const preserveSymlinks =
                    this.options.scriptOptions.preserveSymlinks ?? tsConfigInfo?.compilerOptions.preserveSymlinks;

                parsedScriptCompilations.push({
                    ...compilation,
                    _entryFilePath: entryFilePath,
                    _outFilePath: outFilePath,
                    _moduleFormat: moduleFormat,
                    _scriptTarget: scriptTarget,
                    _tsConfigInfo: tsConfigInfo,
                    _emitDeclarationOnly: emitDeclarationOnly,
                    _declaration: declaration,
                    _bundle: bundle,
                    _minify: minify,
                    _sourceMap: sourceMap,
                    _environmentTargets: [...environmentTargets],
                    _externals: [...externals],
                    _globals: globals,
                    _preserveSymlinks: preserveSymlinks
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
            const detectedTsConfigFilePathRel = normalizePathToPOSIXStyle(
                path.relative(process.cwd(), detectedTsConfigFilePath)
            );
            this.logger.debug(`Tsconfig file detected: ${detectedTsConfigFilePathRel}`);
        }

        return detectedTsConfigFilePath;
    }

    private async detectTsConfigPath(): Promise<string | null> {
        const { workspaceRoot, projectRoot } = this.options.buildTask;

        const cacheKey = projectRoot;
        const cachedPath = tsConfigPathsCache.get(cacheKey);
        if (cachedPath != null) {
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

    private async getEntryFilePath(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation>;
            compilationIndex: number;
            tsConfigInfo: Readonly<TsConfigInfo> | undefined;
            packageJsonInfo: Readonly<PackageJsonInfo> | null;
        }>
    ): Promise<string> {
        const { projectRoot, projectName, configPath } = this.options.buildTask;
        const { compilation, compilationIndex, tsConfigInfo, packageJsonInfo } = options;

        const configLocation = `${this.configLocationPrefix}/compilations/${compilationIndex}/entry`;

        if (compilation.entry) {
            const normalizedEntry = normalizePathToPOSIXStyle(compilation.entry);
            const cacheKey = `${projectRoot}!${normalizedEntry}`;
            const cachedPath = entryFilePathsCache.get(cacheKey);
            if (cachedPath) {
                return cachedPath;
            }

            if (
                !normalizedEntry ||
                normalizedEntry.length < 4 ||
                !/\.(tsx|mts|cts|ts|jsx|mjs|cjs|js)$/i.test(normalizedEntry)
            ) {
                const errMsg = `Unsupported script entry file extension '${compilation.entry}'.`;
                if (projectName) {
                    throw new InvalidConfigError(errMsg, configPath, configLocation);
                } else {
                    throw new InvalidCommandOptionError('script', compilation.entry, errMsg);
                }
            }

            const entryFilePath = resolvePath(projectRoot, normalizedEntry);

            if (!(await pathExists(entryFilePath, true))) {
                const errMsg = `The entry file ${compilation.entry} doesn't exist.`;
                if (projectName) {
                    throw new InvalidConfigError(errMsg, configPath, configLocation);
                } else {
                    throw new InvalidCommandOptionError('script', compilation.entry, errMsg);
                }
            }

            entryFilePathsCache.set(cacheKey, entryFilePath);

            return entryFilePath;
        }

        this.logger.debug(`Detecting entry file for compilation/${compilationIndex}...`);

        const detectedEntryFilePath = await this.detectEntryFilePath({
            tsConfigInfo,
            packageJsonInfo
        });

        if (!detectedEntryFilePath) {
            throw new InvalidConfigError(
                `Could not detect entry file automatically. Specify 'entry' value in script compilations.`,
                configPath,
                configLocation
            );
        }

        const detectedEntryFilePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), detectedEntryFilePath));
        this.logger.debug(`Entry file detected: ${detectedEntryFilePathRel}`);

        return detectedEntryFilePath;
    }

    private async detectEntryFilePath(
        options: Readonly<{
            tsConfigInfo: Readonly<TsConfigInfo> | undefined;
            packageJsonInfo: Readonly<PackageJsonInfo> | null;
        }>
    ): Promise<string | null> {
        const { projectRoot } = this.options.buildTask;
        const { tsConfigInfo, packageJsonInfo } = options;

        const cacheKey = projectRoot;
        const cached = entryFilePathsCache.get(cacheKey);
        if (cached !== null) {
            return cached?.length ? cached : null;
        }

        const lastPartPackageName = packageJsonInfo?.packageName
            ? getLastPartPackageName(packageJsonInfo.packageName)
            : null;

        const searchFileNames = ['public_api', 'public-api', 'index'];
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

        // TODO: To review - tsConfigInfo?.fileNames for includes
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

            return null;
        }
    }

    private async getOutputFilePath(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation>;
            compilationIndex: number | undefined;
            entryFilePath: string;
            forTypesOutput: boolean;
            bundle: boolean;
            multiOutputsFormat: boolean;
            moduleFormat: ScriptModuleFormat;
            tsConfigInfo: Readonly<TsConfigInfo> | undefined;
            scriptTarget: ScriptTargetStrings | undefined;
            packageJsonInfo: Readonly<PackageJsonInfo> | null;
        }>
    ): Promise<string> {
        const {
            compilation,
            compilationIndex,
            entryFilePath,
            tsConfigInfo,
            forTypesOutput,
            bundle,
            multiOutputsFormat,
            moduleFormat,
            scriptTarget,
            packageJsonInfo
        } = options;

        const { configPath, outDir, workspaceRoot, projectRoot } = this.options.buildTask;

        const lastPartPackageName = packageJsonInfo?.packageName
            ? getLastPartPackageName(packageJsonInfo.packageName)
            : null;

        const entryFileName = path.basename(entryFilePath);
        const entryFileExt = path.extname(entryFileName);
        const entryFileNameWithoutExt = entryFileName.substring(0, entryFileName.length - entryFileExt.length);

        if (compilation.out?.trim().length) {
            const configLocation = `${this.configLocationPrefix}/compilations/${compilationIndex}/out`;

            let outFilePath: string;

            let normalziedOut = normalizePathToPOSIXStyle(compilation.out);
            const normalziedOutExt = path.extname(normalziedOut);

            normalziedOut = normalziedOut.replace(/\[name\]/gi, entryFileNameWithoutExt);
            if (lastPartPackageName) {
                normalziedOut = normalziedOut.replace(/\[package_?name\]/gi, lastPartPackageName);
            }

            if (
                !compilation.out?.trim().endsWith('/') &&
                normalziedOutExt &&
                /^\.(d\.[cm]?ts|mjs|cjs|jsx?)$/i.test(normalziedOutExt)
            ) {
                // Validation
                //
                if (forTypesOutput) {
                    if (!/^\.d\.[cm]?ts$/i.test(normalziedOutExt)) {
                        throw new InvalidConfigError(
                            'Invalid file extension for declaration output.',
                            configPath,
                            configLocation
                        );
                    }
                } else {
                    if (/^\.d\.[cm]?ts$/i.test(normalziedOutExt)) {
                        throw new InvalidConfigError(
                            'Invalid file extension for non-declaration output.',
                            configPath,
                            configLocation
                        );
                    }
                }

                outFilePath = resolvePath(outDir, normalziedOut);
            } else {
                const outFileName = await this.getOutputFileName(options);
                outFilePath = resolvePath(outDir, path.join(normalziedOut, outFileName));
            }

            if (isSamePath(outFilePath, entryFilePath)) {
                throw new InvalidConfigError(
                    'The compilation output path must not be the same as entry file path.',
                    configPath,
                    configLocation
                );
            }

            if (!isInFolder(outDir, outFilePath)) {
                throw new InvalidConfigError(
                    'The compilation output path must not be outside of project outDir.',
                    configPath,
                    configLocation
                );
            }

            return outFilePath;
        } else {
            const outFileName = await this.getOutputFileName(options);
            let customOutDir = outDir;

            if (
                tsConfigInfo?.configPath &&
                tsConfigInfo?.compilerOptions.outDir != null &&
                isInFolder(projectRoot, tsConfigInfo.configPath) &&
                (isInFolder(outDir, tsConfigInfo.compilerOptions.outDir) ||
                    isSamePath(outDir, tsConfigInfo.compilerOptions.outDir))
            ) {
                customOutDir = path.resolve(tsConfigInfo.compilerOptions.outDir);
            } else if (!isSamePath(projectRoot, workspaceRoot)) {
                const relToWorkspaceRoot = normalizePathToPOSIXStyle(path.relative(workspaceRoot, projectRoot));
                if (relToWorkspaceRoot.split('/').length > 1) {
                    customOutDir = resolvePath(outDir, relToWorkspaceRoot);
                }
            }

            if (multiOutputsFormat) {
                if (forTypesOutput) {
                    customOutDir = path.resolve(customOutDir, `types`);
                } else {
                    if (moduleFormat === 'esm') {
                        if (scriptTarget && scriptTarget !== 'ES5') {
                            const year = getYearFromScriptTarget(scriptTarget);

                            if (year > 2014) {
                                customOutDir = bundle
                                    ? path.resolve(customOutDir, `fesm${year}`)
                                    : path.resolve(customOutDir, `esm${year}`);
                            } else {
                                customOutDir = bundle
                                    ? path.resolve(customOutDir, 'fesm')
                                    : path.resolve(customOutDir, 'esm');
                            }
                        } else {
                            customOutDir = bundle
                                ? path.resolve(customOutDir, 'fesm5')
                                : path.resolve(customOutDir, 'esm5');
                        }
                    } else if (moduleFormat === 'cjs') {
                        customOutDir = bundle
                            ? path.resolve(customOutDir, `bundles`)
                            : path.resolve(customOutDir, `cjs`);
                    } else {
                        customOutDir = bundle
                            ? path.resolve(customOutDir, `bundles`)
                            : moduleFormat === 'umd'
                            ? path.resolve(customOutDir, `umd`)
                            : path.resolve(customOutDir, `iife`);
                    }
                }
            }

            const outputPath = resolvePath(customOutDir, outFileName);

            return outputPath;
        }
    }

    private async getOutputFileName(
        options: Readonly<{
            entryFilePath: string;
            forTypesOutput: boolean;
            bundle: boolean;
            moduleFormat: ScriptModuleFormat;
            packageJsonInfo: Readonly<PackageJsonInfo> | null;
        }>
    ): Promise<string> {
        const { entryFilePath, forTypesOutput, moduleFormat, bundle, packageJsonInfo } = options;

        if (packageJsonInfo?.packageJsonConfig) {
            const packageJsonConfig = packageJsonInfo.packageJsonConfig;

            let entryFromPackageJson: string | undefined;

            if (forTypesOutput) {
                if (packageJsonConfig.exports && typeof packageJsonConfig.exports === 'object') {
                    const exports = packageJsonConfig.exports as Record<
                        string,
                        | {
                              types?: unknown;
                              import?: string | { types?: unknown };
                              require?: string | { types?: unknown };
                          }
                        | undefined
                    >;

                    if (
                        moduleFormat === 'esm' &&
                        exports['.']?.import &&
                        typeof exports['.'].import === 'object' &&
                        exports['.'].import.types &&
                        typeof exports['.'].import.types === 'string'
                    ) {
                        entryFromPackageJson = exports['.'].import.types.trim();
                    } else if (
                        moduleFormat === 'cjs' &&
                        exports['.']?.require &&
                        typeof exports['.'].require === 'object' &&
                        exports['.'].require.types &&
                        typeof exports['.'].require.types === 'string'
                    ) {
                        entryFromPackageJson = exports['.'].require.types.trim();
                    } else if (exports['.']?.types && typeof exports['.'].types === 'string') {
                        entryFromPackageJson = exports['.']?.types.trim();
                    }
                }

                if (!entryFromPackageJson && packageJsonConfig.types && typeof packageJsonConfig.types === 'string') {
                    entryFromPackageJson = packageJsonConfig.types.trim();
                }
            } else {
                if (packageJsonConfig.exports && typeof packageJsonConfig.exports === 'object') {
                    const exports = packageJsonConfig.exports as Record<
                        string,
                        | {
                              import?: string | { default?: unknown };
                              require?: string | { default?: unknown };
                              esm?: unknown;
                              default?: unknown;
                          }
                        | undefined
                    >;

                    if (
                        moduleFormat === 'esm' &&
                        !bundle &&
                        exports['.']?.esm &&
                        typeof exports['.'].esm === 'string'
                    ) {
                        entryFromPackageJson = exports['.']?.esm.trim();
                    } else if (
                        moduleFormat === 'esm' &&
                        exports['.']?.import &&
                        typeof exports['.'].import === 'object' &&
                        exports['.'].import.default &&
                        typeof exports['.'].import.default === 'string'
                    ) {
                        entryFromPackageJson = exports['.'].import.default.trim();
                    } else if (
                        moduleFormat === 'cjs' &&
                        exports['.']?.require &&
                        typeof exports['.'].require === 'object' &&
                        exports['.'].require.default &&
                        typeof exports['.'].require.default === 'string'
                    ) {
                        entryFromPackageJson = exports['.'].require.default.trim();
                    }

                    if (!entryFromPackageJson && exports['.']?.default && typeof exports['.'].default === 'string') {
                        entryFromPackageJson = exports['.']?.default.trim();
                    }
                }

                if (!entryFromPackageJson && packageJsonConfig.module && typeof packageJsonConfig.module === 'string') {
                    entryFromPackageJson = packageJsonConfig.module.trim();
                }

                if (!entryFromPackageJson && packageJsonConfig.main && typeof packageJsonConfig.main === 'string') {
                    entryFromPackageJson = packageJsonConfig.main.trim();
                }
            }

            if (entryFromPackageJson) {
                const baseFileName = path.basename(normalizePathToPOSIXStyle(entryFromPackageJson));
                if (baseFileName && /\.(d\.[cm]?ts|mjs|cjs|jsx?)$/i.test(baseFileName)) {
                    return baseFileName;
                }
            }
        }

        const entryFileName = path.basename(entryFilePath);
        const entryFileExt = path.extname(entryFileName);
        const entryFileNameWithoutExt = entryFileName.substring(0, entryFileName.length - entryFileExt.length);

        let suggestedOutFileExt = '.js';
        if (forTypesOutput) {
            if (/^\.mts$/i.test(entryFileExt)) {
                suggestedOutFileExt = '.d.mts';
            } else if (/^\.cts$/i.test(entryFileExt)) {
                suggestedOutFileExt = '.d.cts';
            } else {
                suggestedOutFileExt = '.d.ts';
            }
        } else if (moduleFormat === 'esm' && /^\.m(t|j)s$/i.test(entryFileExt)) {
            suggestedOutFileExt = '.mjs';
        } else if (moduleFormat === 'cjs' && /^\.c(t|j)s$/i.test(entryFileExt)) {
            suggestedOutFileExt = '.cjs';
        } else if (/^\.(t|j)sx$/i.test(entryFileExt)) {
            suggestedOutFileExt = '.jsx';
        }

        const lastPartPackageName = packageJsonInfo?.packageName
            ? getLastPartPackageName(packageJsonInfo.packageName)
            : null;

        if (
            lastPartPackageName &&
            bundle &&
            lastPartPackageName.toLowerCase() !== entryFileNameWithoutExt.toLowerCase() &&
            entryFileNameWithoutExt.toLocaleLowerCase() !== 'index'
        ) {
            const searchExtNames = ['.mts', '.cts', '.ts', '.tsx', '.mjs', '.cjs', '.js', '.jsx'];
            const entryRoot = path.dirname(entryFilePath);

            for (const extName of searchExtNames) {
                const fileNameWithExt = lastPartPackageName + extName;
                const found = await findUp(
                    fileNameWithExt,
                    [path.resolve(entryRoot, 'src'), path.resolve(entryRoot, 'lib')],
                    entryRoot,
                    true
                );

                if (found) {
                    return lastPartPackageName + suggestedOutFileExt;
                }
            }
        }

        return entryFileNameWithoutExt + suggestedOutFileExt;
    }

    private getScriptTarget(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation> | null;
            tsConfigInfo: Readonly<TsConfigInfo> | undefined;
        }>
    ): ScriptTargetStrings | undefined {
        const { compilation, tsConfigInfo } = options;

        if (compilation?.scriptTarget) {
            return compilation.scriptTarget;
        }

        if (tsConfigInfo?.compilerOptions.target) {
            return ts.ScriptTarget[tsConfigInfo.compilerOptions.target] as ScriptTargetStrings;
        }

        return undefined;
    }

    private getModuleFormat(
        options: Readonly<{
            compilation: Readonly<ScriptCompilation> | null;
            tsConfigInfo: Readonly<TsConfigInfo> | undefined;
            entryFilePath: string | null;
            packageJsonInfo: Readonly<PackageJsonInfo> | null;
        }>
    ): ScriptModuleFormat | undefined {
        const { compilation, tsConfigInfo, entryFilePath, packageJsonInfo } = options;

        if (compilation?.moduleFormat) {
            return compilation.moduleFormat;
        }

        if (compilation?.out?.trim().length) {
            const trimedOut = compilation.out.trim();
            const outExt = path.extname(trimedOut);

            if (outExt && /\.cjs$/i.test(outExt)) {
                return 'cjs';
            }

            if (outExt && /\.mjs$/i.test(outExt)) {
                return 'esm';
            }
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

            if ((moduleKind as number) > 4) {
                return 'esm';
            }
        }

        if (packageJsonInfo?.packageJsonConfig.type === 'module') {
            return 'esm';
        }

        const environmentTargets: string[] =
            compilation?.environmentTargets ?? this.options.scriptOptions.environmentTargets ?? [];

        if (
            (entryFilePath != null && /\.c[tj]s$/i.test(entryFilePath)) ||
            (!environmentTargets.includes('web') &&
                !environmentTargets.includes('browser') &&
                environmentTargets.some((e) => e.startsWith('node')) &&
                tsConfigInfo?.compilerOptions.moduleResolution !== ts.ModuleResolutionKind.NodeNext &&
                tsConfigInfo?.compilerOptions.moduleResolution !== ts.ModuleResolutionKind.Node16 &&
                (!entryFilePath || (entryFilePath && !/\.m[tj]s$/i.test(entryFilePath))))
        ) {
            return 'cjs';
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

            globalName = dashCaseToCamelCase(globalName);

            globals[externalkey] = globalName;
        }

        return {
            externals,
            globals
        };
    }
}

/**
 * @internal
 */
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

        scriptOptions.compilations = entries.map((e) => {
            return {
                entry: e
            };
        });
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
