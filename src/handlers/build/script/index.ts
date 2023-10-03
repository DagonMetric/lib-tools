/* eslint-disable import/default */
/* eslint-disable import/no-named-as-default-member */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import {
    ScriptCompilation,
    ScriptModuleFormat,
    ScriptOptions,
    ScriptTargetStrings
} from '../../../config-models/index.js';
import { PackageJsonInfo, SubstitutionInfo, WorkspaceInfo } from '../../../config-models/parsed/index.js';
import { CompilationError, InvalidCommandOptionError, InvalidConfigError } from '../../../exceptions/index.js';
import {
    LogLevelStrings,
    Logger,
    LoggerBase,
    colors,
    dashCaseToCamelCase,
    findUp,
    isInFolder,
    isSamePaths,
    normalizePathToPOSIXStyle,
    pathExists,
    resolvePath
} from '../../../utils/index.js';

import { BuildTaskHandleContext } from '../../interfaces/index.js';

import { CompileOptions, CompileResult, CompilerFn, TsConfigInfo } from './interfaces/index.js';

const supportdEntryExtPattern = '\\.(tsx|mts|cts|ts|jsx|mjs|cjs|js)$';
const supportdEntryExtRegExp = new RegExp(supportdEntryExtPattern, 'i');
const supportedOutExtRegExp = /\.(d\.[cm]?ts|mjs|cjs|json|jsx?)$/i;
const tsConfigPathsCache = new Map<string, string>();
const tsConfigInfoCache = new Map<string, { locationKey: string; tsConfigInfo: TsConfigInfo }>();
const entryFilePathsCache = new Map<string, string>();
const compilerCache = new Map<string, CompilerFn>();

interface ParsedScriptCompilation extends ScriptCompilation {
    readonly _entryFilePath: string;
    readonly _outFilePath: string;
    readonly _moduleFormat: ScriptModuleFormat;
    readonly _scriptTarget: ScriptTargetStrings;
    readonly _bundle: boolean;
    readonly _sourceMap: boolean;
    readonly _minify: boolean;
    readonly _environmentTargets: string[] | undefined;
    readonly _externals: string[] | undefined;
    readonly _tsConfigInfo: TsConfigInfo | undefined;
    readonly _declaration: boolean | undefined;
    readonly _emitDeclarationOnly: boolean | undefined;
    readonly _globals: Record<string, string> | undefined;
}

export * from './interfaces/index.js';

export interface ScriptTaskRunnerOptions {
    readonly scriptOptions: ScriptOptions;
    readonly workspaceInfo: WorkspaceInfo;
    readonly outDir: string;
    readonly dryRun: boolean | undefined;
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings;
    readonly packageJsonInfo: PackageJsonInfo | null;
    readonly bannerText: string | null;
    readonly substitutions: SubstitutionInfo[];
    readonly env: string | undefined;
}

export interface ScriptMainOutputAsset {
    readonly scriptTarget: ScriptTargetStrings;
    readonly moduleFormat: ScriptModuleFormat;
    readonly outputFilePath: string;
    readonly size: number;
}

export interface ScriptResult {
    readonly mainOutputAssets: ScriptMainOutputAsset[];
    readonly emitted: boolean;
    readonly time: number;
}

export class ScriptTaskRunner {
    private readonly logger: LoggerBase;
    private readonly configLocationPrefix: string;

    constructor(readonly options: ScriptTaskRunnerOptions) {
        this.configLocationPrefix = `projects/${this.options.workspaceInfo.projectName ?? '0'}/tasks/build/script`;
        this.logger = this.options.logger;
    }

    async run(): Promise<ScriptResult> {
        this.logger.group('\u25B7 script');

        const mainOutputAssets: ScriptMainOutputAsset[] = [];
        let totalTime = 0;
        const compilations = await this.getParsedCompilations();

        for (let i = 0; i < compilations.length; i++) {
            const compilation = compilations[i];

            if (compilations.length > 1) {
                this.logger.group(`\u25B7 compilations/${i}`);
            }

            const compileOptions: CompileOptions = {
                workspaceInfo: this.options.workspaceInfo,
                entryFilePath: compilation._entryFilePath,
                outFilePath: compilation._outFilePath,
                moduleFormat: compilation._moduleFormat,
                scriptTarget: compilation._scriptTarget,
                sourceMap: compilation._sourceMap,
                minify: compilation._minify,
                globalName: compilation.globalName,
                tsConfigInfo: compilation._tsConfigInfo,
                emitDeclarationOnly: compilation._emitDeclarationOnly,
                declaration: compilation._declaration,
                environmentTargets: compilation._environmentTargets,
                externals: compilation._externals,
                globals: compilation._globals,
                bannerText: this.options.bannerText,
                substitutions: this.options.substitutions,
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
                compilation.compiler?.toLowerCase().trim() === 'webpack' ||
                (!compilation.compiler?.trim().length && compilation._bundle && compileOptions.moduleFormat === 'iife')
            ) {
                const cacheKey = 'webpack';
                const cachefn = compilerCache.get(cacheKey);
                if (cachefn) {
                    compilerFn = cachefn;
                } else {
                    const compilerModule = await import('./compilers/webpack/index.js');
                    compilerFn = compilerModule.default;
                    compilerCache.set(cacheKey, compilerModule.default);
                }
            } else if (
                compilation.compiler?.toLowerCase().trim() === 'esbuild' ||
                (!compilation.compiler?.trim().length && compilation._bundle && compileOptions.moduleFormat === 'esm')
            ) {
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
                    const projectRoot = this.options.workspaceInfo.projectRoot;
                    const handlerPath = resolvePath(projectRoot, handlerStr);

                    const compilerModule = (await import(pathToFileURL(handlerPath).toString())) as {
                        default?: CompilerFn;
                    };

                    if (!compilerModule.default || typeof compilerModule.default !== 'function') {
                        throw new InvalidConfigError(
                            'No default function export found for custom compiler module.',
                            this.options.workspaceInfo.configPath,
                            `${this.configLocationPrefix}/compilations/${i}/compiler`
                        );
                    }

                    compilerFn = compilerModule.default;
                    compilerCache.set(cacheKey, compilerModule.default);
                }
            } else {
                throw new InvalidConfigError(
                    'could not detect compiler tool for script compilation.',
                    this.options.workspaceInfo.configPath,
                    `${this.configLocationPrefix}/compilations/${i}/compiler`
                );
            }

            const compileResult = await compilerFn(compileOptions, this.logger);

            totalTime += compileResult.time;
            const mainOuputAsset = compileResult.builtAssets.find((a) =>
                isSamePaths(a.path, compileOptions.outFilePath)
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
                scriptTarget: compileOptions.scriptTarget,
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
            time: totalTime,
            emitted: this.options.dryRun ? false : true
        };

        this.logger.groupEnd();
        this.logger.info(`${colors.lightGreen('\u25B6')} script [${colors.lightGreen(`${result.time} ms`)}]`);

        return result;
    }

    private async getParsedCompilations(): Promise<ParsedScriptCompilation[]> {
        this.logger.debug('Preparing compilations...');

        if (this.options.scriptOptions.compilations === 'auto') {
            const tsConfigPath = await this.detectTsConfigPath();
            const tsConfigInfo = tsConfigPath ? await this.getTsConfigInfo(tsConfigPath, null, null) : undefined;
            const entryFilePath = await this.detectEntryFilePath(tsConfigInfo);

            if (!entryFilePath) {
                throw new InvalidConfigError(
                    `Could not detect compilations automatically. Specify 'compilations' in script options.`,
                    this.options.workspaceInfo.configPath,
                    `${this.configLocationPrefix}/compilations`
                );
            }

            const parsedScriptCompilations: ParsedScriptCompilation[] = [];

            const entry = normalizePathToPOSIXStyle(
                path.relative(this.options.workspaceInfo.projectRoot, entryFilePath)
            );
            const tsconfig = tsConfigInfo?.configPath
                ? normalizePathToPOSIXStyle(
                      path.relative(this.options.workspaceInfo.projectRoot, tsConfigInfo.configPath)
                  )
                : undefined;

            if (
                this.options.packageJsonInfo &&
                this.options.packageJsonInfo.packageJson.private !== false &&
                tsConfigInfo != null &&
                (tsConfigInfo.compilerOptions.module as number) > 3 &&
                (tsConfigInfo.compilerOptions.module as number) < 100 &&
                (tsConfigInfo.compilerOptions.target as number) > 1 &&
                (tsConfigInfo.compilerOptions.target as number) < 100
            ) {
                const moduleFormat: ScriptModuleFormat = 'esm';
                const scriptTarget = this.getScriptTarget(null, tsConfigInfo) ?? 'ESNext';
                const year = this.getYearFromScriptTarget(scriptTarget);

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
                    sourceMap: false,
                    minify: false,
                    out: 'types'
                };

                const typesOutFilePath = this.getOutputFilePath(
                    typesCompilation,
                    0,
                    entryFilePath,
                    true,
                    tsConfigInfo,
                    typesCompilation.moduleFormat,
                    typesCompilation.scriptTarget
                );

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
                    _environmentTargets: [],
                    _externals: [],
                    _globals: {}
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
                    minify: false,
                    out: `esm${year}`
                };

                const esmOutFilePath = this.getOutputFilePath(
                    esmCompilation,
                    1,
                    entryFilePath,
                    false,
                    tsConfigInfo,
                    esmCompilation.moduleFormat,
                    esmCompilation.scriptTarget
                );

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
                    _environmentTargets: [],
                    _externals: [],
                    _globals: {}
                });

                // fesm
                //
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

                const fesmOutFilePath = this.getOutputFilePath(
                    fesmCompilation,
                    2,
                    entryFilePath,
                    false,
                    tsConfigInfo,
                    fesmCompilation.moduleFormat,
                    fesmCompilation.scriptTarget
                );

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
                    _environmentTargets: [],
                    _externals: [],
                    _globals: {}
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
                let moduleFormat = this.getModuleFormat(null, tsConfigInfo, entryFilePath);
                if (!moduleFormat) {
                    moduleFormat = emitDeclarationOnly ? 'esm' : 'iife';
                }

                let scriptTarget = this.getScriptTarget(null, tsConfigInfo);
                if (!scriptTarget) {
                    scriptTarget = moduleFormat === 'iife' && !emitDeclarationOnly ? 'ES5' : 'ESNext';
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

                const outFilePath = this.getOutputFilePath(
                    compilation,
                    0,
                    entryFilePath,
                    emitDeclarationOnly,
                    tsConfigInfo,
                    moduleFormat,
                    scriptTarget
                );

                // environmentTargets
                const environmentTargets: string[] = this.options.scriptOptions.environmentTargets ?? [];

                // minify
                const minify = moduleFormat === 'iife' && !emitDeclarationOnly ? true : false;

                // sourceMap
                let sourceMap = true;
                if (emitDeclarationOnly) {
                    sourceMap = false;
                } else if (tsConfigInfo?.compilerOptions.inlineSourceMap != null) {
                    sourceMap = tsConfigInfo?.compilerOptions.inlineSourceMap;
                } else if (tsConfigInfo?.compilerOptions.sourceMap != null) {
                    sourceMap = tsConfigInfo?.compilerOptions.sourceMap;
                }

                // externals
                const { externals, globals } = this.getExternalsAndGlobals(compilation);

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
                    _environmentTargets: environmentTargets,
                    _externals: externals,
                    _globals: globals
                });
            }

            return parsedScriptCompilations;
        } else {
            if (!this.options.scriptOptions.compilations.length) {
                throw new InvalidConfigError(
                    'No compilation options.',
                    this.options.workspaceInfo.configPath,
                    `${this.configLocationPrefix}/scriptOptions/compilations`
                );
            }

            const parsedScriptCompilations: ParsedScriptCompilation[] = [];

            for (let i = 0; i < this.options.scriptOptions.compilations.length; i++) {
                const compilation = this.options.scriptOptions.compilations[i];

                if (!Object.keys(compilation).length) {
                    throw new InvalidConfigError(
                        'Invalid empty compilation options.',
                        this.options.workspaceInfo.configPath,
                        `${this.configLocationPrefix}/compilations/${i}`
                    );
                }

                const tsConfigPath = await this.getTsConfigPath(compilation, i);
                const tsConfigInfo = tsConfigPath
                    ? await this.getTsConfigInfo(tsConfigPath, compilation, i)
                    : undefined;
                const entryFilePath = await this.getEntryFilePath(compilation, i);
                const scriptTarget = this.getScriptTarget(compilation, tsConfigInfo);
                const moduleFormat = this.getModuleFormat(compilation, tsConfigInfo, entryFilePath);

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

                const outFilePath = this.getOutputFilePath(
                    compilation,
                    i,
                    entryFilePath,
                    emitDeclarationOnly,
                    tsConfigInfo,
                    moduleFormat,
                    scriptTarget
                );

                if (!moduleFormat) {
                    throw new InvalidConfigError(
                        `Could not detect module format automatically. Specify 'moduleFormat' value in script compilations.`,
                        this.options.workspaceInfo.configPath,
                        `${this.configLocationPrefix}/compilations/${i}/moduleFormat`
                    );
                }

                if (!scriptTarget) {
                    throw new InvalidConfigError(
                        `Could not detect script target automatically. Specify 'scriptTarget' value in script compilations.`,
                        this.options.workspaceInfo.configPath,
                        `${this.configLocationPrefix}/compilations/${i}/scriptTarget`
                    );
                }

                // environmentTargets
                const environmentTargets: string[] =
                    compilation.environmentTargets ?? this.options.scriptOptions.environmentTargets ?? [];

                // bundle
                let bundle = true;
                if (compilation.bundle != null) {
                    bundle = compilation.bundle;
                } else if (emitDeclarationOnly) {
                    bundle = false;
                }

                // minify
                let minify = false;
                if (compilation.minify != null) {
                    minify = compilation.minify;
                } else {
                    if (bundle && moduleFormat === 'iife' && !emitDeclarationOnly) {
                        minify = true;
                    }
                }

                // sourceMap
                let sourceMap = true;
                if (compilation.sourceMap != null) {
                    sourceMap = compilation.sourceMap;
                } else if (!emitDeclarationOnly && tsConfigInfo?.compilerOptions.inlineSourceMap != null) {
                    sourceMap = tsConfigInfo?.compilerOptions.inlineSourceMap;
                } else if (!emitDeclarationOnly && tsConfigInfo?.compilerOptions.sourceMap != null) {
                    sourceMap = tsConfigInfo?.compilerOptions.sourceMap;
                }

                // externals
                const { externals, globals } = this.getExternalsAndGlobals(compilation);

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
                    _environmentTargets: environmentTargets,
                    _externals: externals,
                    _globals: globals
                });
            }

            return parsedScriptCompilations;
        }
    }

    private async getTsConfigInfo(
        tsConfigPath: string,
        compilation: ScriptCompilation | null,
        compilationIndex: number | null
    ): Promise<TsConfigInfo> {
        const projectRoot = this.options.workspaceInfo.projectRoot;

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
                this.options.workspaceInfo.configPath,
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
                this.options.workspaceInfo.configPath,
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
        compilation: ScriptCompilation | null,
        compilationIndex: number | null
    ): Promise<string | null> {
        const tsConfigFile = compilation?.tsconfig ?? this.options.scriptOptions.tsconfig;

        if (tsConfigFile) {
            const configLocation = compilation?.tsconfig
                ? `${this.configLocationPrefix}/compilations/${compilationIndex}/tsconfig`
                : `${this.configLocationPrefix}/tsconfig`;

            const projectRoot = this.options.workspaceInfo.projectRoot;
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
                throw new InvalidConfigError(
                    `Invalid tsconfig file ${tsConfigFile}.`,
                    this.options.workspaceInfo.configPath,
                    configLocation
                );
            }

            const tsConfigFilePath = resolvePath(projectRoot, normalizedTsConfigFile);

            if (!(await pathExists(tsConfigFilePath, true))) {
                throw new InvalidConfigError(
                    `The tsconfig file ${tsConfigFile} doesn't exist.`,
                    this.options.workspaceInfo.configPath,
                    configLocation
                );
            }

            tsConfigPathsCache.set(cacheKey, tsConfigFilePath);

            return tsConfigFilePath;
        }

        return this.detectTsConfigPath();
    }

    private async detectTsConfigPath(): Promise<string | null> {
        const projectRoot = this.options.workspaceInfo.projectRoot;
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
            foundPath = await findUp(configFile, projectRoot, this.options.workspaceInfo.workspaceRoot, true);

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

    private async getEntryFilePath(compilation: ScriptCompilation, compilationIndex: number): Promise<string> {
        const projectRoot = this.options.workspaceInfo.projectRoot;
        const projectName = this.options.workspaceInfo.projectName;
        const configPath = this.options.workspaceInfo.configPath;
        const configLocation = `${this.configLocationPrefix}/compilations/${compilationIndex}/entry`;

        if (compilation.entry) {
            const normalizedEntry = normalizePathToPOSIXStyle(compilation.entry);
            const cacheKey = `${projectRoot}!${normalizedEntry}`;
            const cachedPath = entryFilePathsCache.get(cacheKey);
            if (cachedPath) {
                return cachedPath;
            }

            if (!normalizedEntry || normalizedEntry.length < 4 || !supportdEntryExtRegExp.test(normalizedEntry)) {
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

        const tsConfigFilePath = await this.getTsConfigPath(compilation, compilationIndex);
        const tsConfigInfo = tsConfigFilePath
            ? await this.getTsConfigInfo(tsConfigFilePath, compilation, compilationIndex)
            : undefined;

        const detectedEntryFilePath = await this.detectEntryFilePath(tsConfigInfo);

        if (!detectedEntryFilePath) {
            throw new InvalidConfigError(
                `Could not detect entry file automatically. Specify 'entry' value in script compilations.`,
                configPath,
                configLocation
            );
        }

        return detectedEntryFilePath;
    }

    private async detectEntryFilePath(tsConfigInfo: TsConfigInfo | undefined): Promise<string | null> {
        const lastPartPackageName = this.getLastPartPackageName();

        if (tsConfigInfo?.fileNames.length && tsConfigInfo.configPath) {
            const cacheKey = tsConfigInfo.configPath;
            const cached = entryFilePathsCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            let foundPath = tsConfigInfo.fileNames[0];

            if (lastPartPackageName) {
                const fileNameTestRegExp = new RegExp('[\\/]' + lastPartPackageName + supportdEntryExtPattern, 'i');
                for (const filePath of tsConfigInfo.fileNames) {
                    if (fileNameTestRegExp.test(filePath)) {
                        foundPath = filePath;
                        break;
                    }
                }
            }

            entryFilePathsCache.set(cacheKey, foundPath);

            return foundPath;
        } else {
            const projectRoot = this.options.workspaceInfo.projectRoot;
            const cacheKey = projectRoot;
            const cached = entryFilePathsCache.get(cacheKey);
            if (cached !== null) {
                return cached?.length ? cached : null;
            }

            const packageNameEntryNames: string[] = [];
            const commonEntryNames = [
                // public_api - ts
                'public_api.mts',
                'public_api.cts',
                'public_api.tsx',
                'public_api.ts',

                // public-api - ts
                'public-api.mts',
                'public-api.cts',
                'public-api.tsx',
                'public-api.ts',

                // index - ts
                'index.mts',
                'index.cts',
                'index.tsx',
                'index.ts',

                // public_api - js
                'public_api.mjs',
                'public_api.cjs',
                'public_api.jsx',
                'public_api.js',

                // public-api - js
                'public-api.mjs',
                'public-api.cjs',
                'public-api.jsx',
                'public-api.js',

                // index - js
                'index.mjs',
                'index.cjs',
                'index.jsx',
                'index.js'
            ];

            if (lastPartPackageName) {
                // ts
                packageNameEntryNames.push(`${lastPartPackageName}.mts`);
                packageNameEntryNames.push(`${lastPartPackageName}.cts`);
                packageNameEntryNames.push(`${lastPartPackageName}.tsx`);
                packageNameEntryNames.push(`${lastPartPackageName}.ts`);

                // js
                packageNameEntryNames.push(`${lastPartPackageName}.mjs`);
                packageNameEntryNames.push(`${lastPartPackageName}.cjs`);
                packageNameEntryNames.push(`${lastPartPackageName}.jsx`);
                packageNameEntryNames.push(`${lastPartPackageName}.js`);
            }

            let foundPath: string | null = null;
            const entryFiles: string[] = [...packageNameEntryNames, ...commonEntryNames];

            for (const entryFile of entryFiles) {
                foundPath = await findUp(entryFile, null, projectRoot, true);

                if (!foundPath && (await pathExists(path.resolve(projectRoot, 'src'), true))) {
                    foundPath = await findUp(entryFile, null, path.resolve(projectRoot, 'src'), true);
                }

                if (!foundPath && (await pathExists(path.resolve(projectRoot, 'lib'), true))) {
                    foundPath = await findUp(
                        entryFile,
                        null,
                        path.resolve(this.options.workspaceInfo.projectRoot, 'lib'),
                        true
                    );
                }

                if (foundPath) {
                    break;
                }
            }

            if (foundPath) {
                entryFilePathsCache.set(cacheKey, foundPath);

                return foundPath;
            } else {
                entryFilePathsCache.set(cacheKey, '');

                return null;
            }
        }
    }

    private getOutputFilePath(
        compilation: ScriptCompilation,
        compilationIndex: number,
        entryFilePath: string,
        forTypesOutput: boolean | undefined,
        tsConfigInfo: TsConfigInfo | undefined,
        moduleFormat: ScriptModuleFormat | undefined,
        scriptTarget: ScriptTargetStrings | undefined
    ): string {
        const entryFileName = path.basename(entryFilePath);
        const entryFileExt = path.extname(entryFileName);
        let suggestedOutFileExt = '.js';
        if (forTypesOutput) {
            suggestedOutFileExt = '.d.ts';
        } else if (moduleFormat === 'esm' && scriptTarget !== 'ES5' && /\.m(t|j)s$/i.test(entryFileExt)) {
            suggestedOutFileExt = '.mjs';
        } else if (moduleFormat === 'cjs' && scriptTarget !== 'ES5' && /\.c(t|j)s$/i.test(entryFileExt)) {
            suggestedOutFileExt = '.cjs';
        } else if (/\.(t|j)sx$/i.test(entryFileExt)) {
            suggestedOutFileExt = '.jsx';
        }

        if (compilation.out?.trim().length) {
            const configLocation = `${this.configLocationPrefix}/compilations/${compilationIndex}/out`;

            let outFilePath: string;
            const normalziedOut = normalizePathToPOSIXStyle(compilation.out);
            const normalziedOutExt = path.extname(normalziedOut);
            if (
                normalziedOutExt &&
                supportedOutExtRegExp.test(normalziedOutExt) &&
                !compilation.out?.trim().endsWith('/')
            ) {
                // Validation
                //
                if (forTypesOutput && !/\.d\.[cm]?ts$/i.test(normalziedOutExt)) {
                    throw new InvalidConfigError(
                        'Invalid file extension to emit declarations.',
                        this.options.workspaceInfo.configPath,
                        configLocation
                    );
                }

                const outFileNameWithoutExt = entryFileName.substring(0, entryFileName.length - entryFileExt.length);
                const lastPartPackageName = this.getLastPartPackageName();

                let outFileName = normalziedOut.replace(/\[name\]/g, outFileNameWithoutExt);
                if (lastPartPackageName) {
                    outFileName = outFileName.replace(/\[package_?name\]/g, lastPartPackageName);
                }

                outFilePath = resolvePath(this.options.outDir, outFileName);
            } else {
                const outFileName =
                    entryFileName.substring(0, entryFileName.length - entryFileExt.length) + suggestedOutFileExt;
                outFilePath = resolvePath(this.options.outDir, path.join(normalziedOut, outFileName));
            }

            if (isSamePaths(outFilePath, entryFilePath)) {
                throw new InvalidConfigError(
                    'The compilation output path must not be the same as entry file path.',
                    this.options.workspaceInfo.configPath,
                    configLocation
                );
            }

            if (!isInFolder(this.options.outDir, outFilePath) && !isSamePaths(this.options.outDir, outFilePath)) {
                throw new InvalidConfigError(
                    'The compilation output path must not be outside of project outDir.',
                    this.options.workspaceInfo.configPath,
                    configLocation
                );
            }

            return outFilePath;
        } else {
            let customOutDir = this.options.outDir;
            let outFileName =
                entryFileName.substring(0, entryFileName.length - entryFileExt.length) + suggestedOutFileExt;

            if (
                tsConfigInfo?.compilerOptions.outFile != null &&
                (compilation.moduleFormat === 'iife' ||
                    tsConfigInfo?.compilerOptions.module === ts.ModuleKind.None ||
                    tsConfigInfo?.compilerOptions.module === ts.ModuleKind.AMD ||
                    tsConfigInfo?.compilerOptions.module === ts.ModuleKind.System)
            ) {
                const tsOutFileName = path.basename(tsConfigInfo.compilerOptions.outFile);
                const tsOutFileExt = path.extname(tsOutFileName);
                outFileName =
                    tsOutFileName.substring(0, tsOutFileName.length - tsOutFileExt.length) + suggestedOutFileExt;
            }

            if (tsConfigInfo?.compilerOptions.outDir != null) {
                customOutDir = path.resolve(tsConfigInfo.compilerOptions.outDir);
            } else {
                const projectRoot = this.options.workspaceInfo.projectRoot;
                const workspaceRoot = this.options.workspaceInfo.workspaceRoot;
                if (!isSamePaths(projectRoot, workspaceRoot)) {
                    const relToWorkspaceRoot = normalizePathToPOSIXStyle(path.relative(workspaceRoot, projectRoot));
                    if (relToWorkspaceRoot.split('/').length > 1) {
                        customOutDir = resolvePath(this.options.outDir, relToWorkspaceRoot);
                    }
                }

                if (forTypesOutput) {
                    customOutDir = path.resolve(customOutDir, `types`);
                } else if (moduleFormat === 'esm' && scriptTarget && scriptTarget !== 'ES5') {
                    const year = this.getYearFromScriptTarget(scriptTarget);

                    if (year > 2014) {
                        customOutDir =
                            compilation.bundle !== false
                                ? path.resolve(customOutDir, `fesm${year}`)
                                : path.resolve(customOutDir, `esm${year}`);
                    }
                } else if (compilation.bundle !== false && moduleFormat === 'iife') {
                    customOutDir = path.resolve(customOutDir, `bundle`);
                }
            }

            if (!isInFolder(this.options.outDir, customOutDir) && !isSamePaths(this.options.outDir, customOutDir)) {
                customOutDir = this.options.outDir;
            }

            const outputPath = resolvePath(customOutDir, outFileName);

            return outputPath;
        }
    }

    private getLastPartPackageName(): string | null {
        let lastPartPackageName: string | null = null;
        if (this.options.packageJsonInfo?.packageName) {
            const packageName = this.options.packageJsonInfo.packageName;
            const lastSlashIndex = packageName.lastIndexOf('/');
            lastPartPackageName = lastSlashIndex > -1 ? packageName.substring(lastSlashIndex + 1) : packageName;
        }

        return lastPartPackageName;
    }

    private getYearFromScriptTarget(scriptTarget: ScriptTargetStrings): number {
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

    private getScriptTarget(
        compilation: ScriptCompilation | null,
        tsConfigInfo: TsConfigInfo | undefined
    ): ScriptTargetStrings | undefined {
        if (compilation?.scriptTarget) {
            return compilation.scriptTarget;
        }

        if (tsConfigInfo?.compilerOptions.target) {
            return ts.ScriptTarget[tsConfigInfo.compilerOptions.target] as ScriptTargetStrings;
        }

        return undefined;
    }

    private getModuleFormat(
        compilation: ScriptCompilation | null,
        tsConfigInfo: TsConfigInfo | undefined,
        entryFilePath: string | null
    ): ScriptModuleFormat | undefined {
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

            if (
                moduleKind === ts.ModuleKind.UMD ||
                moduleKind === ts.ModuleKind.System ||
                (moduleKind as number) === 0
            ) {
                return 'iife';
            }

            if ((moduleKind as number) > 4) {
                return 'esm';
            }
        }

        if (this.options.packageJsonInfo?.packageJson.type === 'module') {
            return 'esm';
        }

        const environmentTargets: string[] =
            compilation?.environmentTargets ?? this.options.scriptOptions.environmentTargets ?? [];

        if (
            (entryFilePath && /\.c[tj]s$/i.test(entryFilePath)) ??
            (!environmentTargets.includes('web') &&
                !environmentTargets.includes('browser') &&
                environmentTargets.find((e) => e.startsWith('node')) != null &&
                (!entryFilePath || (entryFilePath && !/\.m[tj]s$/i.test(entryFilePath))))
        ) {
            return 'cjs';
        }

        if (
            (environmentTargets.includes('web') ||
                environmentTargets.includes('browser') ||
                this.options.packageJsonInfo == null) &&
            environmentTargets.find((e) => e.startsWith('node')) == null &&
            tsConfigInfo?.compilerOptions.moduleResolution !== ts.ModuleResolutionKind.NodeNext &&
            tsConfigInfo?.compilerOptions.moduleResolution !== ts.ModuleResolutionKind.Node16
        ) {
            return 'iife';
        }

        return undefined;
    }

    private getExternalsAndGlobals(compilation: ScriptCompilation | null): {
        externals: string[];
        globals: Record<string, string>;
    } {
        const externalGlobalMap = new Map<string, string>();
        const externals: string[] = [];
        const excludes = compilation?.externalExclude ?? this.options.scriptOptions.externalExclude ?? [];

        if (this.options.scriptOptions.packageDependenciesAsExternals !== false) {
            if (this.options.packageJsonInfo?.packageJson?.devDependencies) {
                Object.keys(this.options.packageJsonInfo.packageJson.devDependencies)
                    .filter((e) => !externals.includes(e) && !excludes.includes(e))
                    .forEach((e) => {
                        externals.push(e);
                    });
            }

            if (this.options.packageJsonInfo?.packageJson?.dependencies) {
                Object.keys(this.options.packageJsonInfo.packageJson.dependencies)
                    .filter((e) => !externals.includes(e) && !excludes.includes(e))
                    .forEach((e) => {
                        externals.push(e);
                    });
            }

            if (this.options.packageJsonInfo?.packageJson?.peerDependencies) {
                Object.keys(this.options.packageJsonInfo.packageJson.peerDependencies)
                    .filter((e) => !externals.includes(e) && !excludes.includes(e))
                    .forEach((e) => {
                        externals.push(e);
                    });
            }

            if (this.options.packageJsonInfo?.packageJson?.optionalDependencies) {
                Object.keys(this.options.packageJsonInfo.packageJson.optionalDependencies)
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

                        if (!externalGlobalMap.get(externalKey)) {
                            externalGlobalMap.set(externalKey, globalName);
                        }
                    }
                }
            }
        }

        if (
            externals.includes('rxjs') &&
            !externals.includes('rxjs/operators') &&
            !excludes.includes('rxjs/operators')
        ) {
            externals.push('rxjs/operators');

            if (!externalGlobalMap.get('rxjs/operators')) {
                externalGlobalMap.set('rxjs/operators', 'rxjs.operators');
            }
        }

        const globalsObj: Record<string, string> = {};
        for (const externalkey of externals) {
            const foundName = externalGlobalMap.get(externalkey);
            if (foundName) {
                globalsObj[externalkey] = foundName;
            } else {
                let globalName = externalkey.replace(/\//g, '.');
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

                globalsObj[externalkey] = globalName;
            }
        }

        return {
            externals,
            globals: globalsObj
        };
    }
}

export function getScriptTaskRunner(context: BuildTaskHandleContext): ScriptTaskRunner | null {
    const buildTask = context.taskOptions;

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

        if (!entries.length) {
            return null;
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

        if (Array.isArray(scriptOptions.compilations)) {
            const newCompilations: ScriptCompilation[] = [];

            for (const compilation of scriptOptions.compilations) {
                if (!Object.keys(compilation).length) {
                    continue;
                }

                newCompilations.push(compilation);
            }

            scriptOptions.compilations = newCompilations;
        }
    }

    if (
        scriptOptions.compilations !== 'auto' &&
        Array.isArray(scriptOptions.compilations) &&
        !scriptOptions.compilations.length
    ) {
        return null;
    }

    const taskRunner = new ScriptTaskRunner({
        scriptOptions,
        workspaceInfo: buildTask._workspaceInfo,
        outDir: buildTask._outDir,
        dryRun: context.dryRun,
        logLevel: context.logLevel ?? 'info',
        logger:
            context.logger ??
            new Logger({
                logLevel: context.logLevel ?? 'info',
                warnPrefix: colors.lightYellow('Warning:'),
                groupIndentation: 4
            }),
        env: context.env,
        packageJsonInfo: buildTask._packageJsonInfo,
        bannerText: buildTask._bannerText,
        substitutions: buildTask._substitutions
    });

    return taskRunner;
}
