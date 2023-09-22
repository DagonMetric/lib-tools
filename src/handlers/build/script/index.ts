import * as path from 'node:path';

import * as ts from 'typescript';

import {
    ScriptCompilation,
    ScriptCompilationTools,
    ScriptModuleFormat,
    ScriptOptions,
    ScriptTargetStrings
} from '../../../config-models/index.js';
import { PackageJsonInfo, WorkspaceInfo } from '../../../config-models/parsed/index.js';
import { InvalidCommandOptionError, InvalidConfigError } from '../../../exceptions/index.js';
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
    readJsonWithComments,
    resolvePath
} from '../../../utils/index.js';

import { BuildTaskHandleContext } from '../../interfaces/index.js';
import { CompileOptions, TsConfigInfo } from './compile/compile-options.js';

const supportdScriptExtRegExp = /\.(tsx|mts|cts|ts|jsx|mjs|cjs|js)$/i;

export interface ScriptTaskRunnerOptions {
    readonly scriptOptions: ScriptOptions;
    readonly workspaceInfo: WorkspaceInfo;
    readonly outDir: string;
    readonly dryRun: boolean | undefined;
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings;
    readonly packageJsonInfo: PackageJsonInfo | null;
    readonly bannerText: string | null;
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
    private readonly tsConfigInfoMap = new Map<
        string,
        { jsonConfig: Record<string, unknown>; parsedConfig: ts.ParsedCommandLine }
    >();
    private readonly configLocationPrefix: string;

    private detectedTsConfigPath: string | null = null;
    private lastFoundEntryFilePath: string | null = null;

    constructor(readonly options: ScriptTaskRunnerOptions) {
        this.configLocationPrefix = `projects/${this.options.workspaceInfo.projectName ?? '0'}/tasks/build/script`;
        this.logger = this.options.logger;
    }

    async run(): Promise<ScriptResult> {
        this.logger.group('\u25B7 script');

        const mainOutputAssets: ScriptMainOutputAsset[] = [];
        let totalTime = 0;

        const compileConfigs = await this.getCompileConfigs();

        for (const compileConfig of compileConfigs) {
            if (compileConfig.tools === 'esbuild') {
                const esbuildModule = await import('./compile/tools/esbuild/index.js');
                const compileResult = await esbuildModule.default(compileConfig.options);
                totalTime += compileResult.time;
                const mainOuputAsset = compileResult.builtAssets.find(
                    (a) => a.path === compileConfig.options.outFilePath
                );
                if (mainOuputAsset) {
                    mainOutputAssets.push({
                        moduleFormat: compileConfig.options.moduleFormat,
                        scriptTarget: compileConfig.options.scriptTarget,
                        outputFilePath: mainOuputAsset.path,
                        size: mainOuputAsset.size
                    });
                }
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

    private async getCompileConfigs(): Promise<{ tools: ScriptCompilationTools; options: CompileOptions }[]> {
        const compileConfigs: { tools: ScriptCompilationTools; options: CompileOptions }[] = [];
        const compilations = await this.getCompilations();

        for (let i = 0; i < compilations.length; i++) {
            const compilation = compilations[i];

            const tsConfigInfo = await this.getTsConfigInfo(compilation, i);
            const entryFilePath = await this.getEntryFilePath(compilation, i);

            // out
            let outFilePath: string;
            const trimedOut = compilation.out?.trim();
            const entryFileName = path.basename(entryFilePath);
            const entryFileExt = path.extname(entryFileName);
            const suggestedOutFileExt = /\.m(t|j)s$/i.test(entryFileExt)
                ? '.mjs'
                : /\.c(t|j)s$/i.test(entryFileExt)
                ? '.cjs'
                : /\.(t|j)sx$/i.test(entryFileExt)
                ? '.jsx'
                : '.js';
            if (trimedOut?.length) {
                const normalziedOut = normalizePathToPOSIXStyle(trimedOut);
                if (trimedOut.endsWith('/')) {
                    const outFileName =
                        entryFileName.substring(0, entryFileName.length - entryFileExt.length) + suggestedOutFileExt;
                    outFilePath = resolvePath(this.options.outDir, path.join(normalziedOut, outFileName));
                } else if (normalziedOut.lastIndexOf('.') > 0 && /\.(mjs|cjs|jsx?)$/i.test(normalziedOut)) {
                    outFilePath = resolvePath(this.options.outDir, normalziedOut);
                } else {
                    outFilePath = resolvePath(this.options.outDir, normalziedOut + suggestedOutFileExt);
                }
            } else {
                let outFileName =
                    entryFileName.substring(0, entryFileName.length - entryFileExt.length) + suggestedOutFileExt;
                if (
                    tsConfigInfo?.parsedConfig.options.outFile != null &&
                    (compilation.moduleFormat === 'iife' ||
                        tsConfigInfo?.parsedConfig.options.module === ts.ModuleKind.None ||
                        tsConfigInfo?.parsedConfig.options.module === ts.ModuleKind.AMD ||
                        tsConfigInfo?.parsedConfig.options.module === ts.ModuleKind.System)
                ) {
                    outFileName = tsConfigInfo?.parsedConfig.options.outFile;
                }

                let customOutDir = this.options.outDir;
                if (tsConfigInfo?.parsedConfig.options.outDir != null) {
                    const tsOutDir = resolvePath(
                        path.dirname(tsConfigInfo.configPath),
                        tsConfigInfo.parsedConfig.options.outDir
                    );
                    if (isInFolder(this.options.outDir, tsOutDir) || isSamePaths(this.options.outDir, tsOutDir)) {
                        customOutDir = tsOutDir;
                    }
                }

                outFilePath = resolvePath(customOutDir, outFileName);
            }

            // environmentTargets
            const environmentTargets: string[] =
                this.options.scriptOptions.environmentTargets ?? compilation.environmentTargets ?? [];

            // scriptTarget
            let scriptTarget: ScriptTargetStrings = 'ESNext';
            if (compilation.scriptTarget) {
                scriptTarget = compilation.scriptTarget;
            } else if (tsConfigInfo?.parsedConfig.options.target) {
                // TODO: to review
                scriptTarget = ts.ScriptTarget[tsConfigInfo.parsedConfig.options.target] as ScriptTargetStrings;
            }

            // moduleFormat
            let moduleFormat: ScriptModuleFormat = 'esm';
            if (compilation.moduleFormat) {
                moduleFormat = compilation.moduleFormat;
            } else {
                if (/\.cjs$/i.test(outFilePath)) {
                    moduleFormat = 'cjs';
                } else if (/\.mjs$/i.test(outFilePath)) {
                    moduleFormat = 'esm';
                } else {
                    if (tsConfigInfo?.parsedConfig.options.module) {
                        const moduleKind = tsConfigInfo.parsedConfig.options.module;
                        if (moduleKind === ts.ModuleKind.CommonJS) {
                            moduleFormat = 'cjs';
                        } else if (
                            moduleKind === ts.ModuleKind.UMD ||
                            moduleKind === ts.ModuleKind.AMD ||
                            moduleKind === ts.ModuleKind.System
                        ) {
                            moduleFormat = 'iife';
                        }
                    } else {
                        if (
                            environmentTargets.length === 1 &&
                            environmentTargets.includes('web') &&
                            (scriptTarget === 'ES5' || scriptTarget === 'ES3')
                        ) {
                            moduleFormat = 'iife';
                        }
                    }
                }
            }

            // bundle
            let bundle = moduleFormat === 'iife' ? true : false;
            if (compilation.bundle != null) {
                bundle = compilation.bundle;
            }

            // minify
            let minify = bundle && moduleFormat === 'iife' ? true : false;
            if (compilation.minify != null) {
                minify = compilation.minify;
            }

            // sourceMap
            let sourceMap = bundle || compilations.length === 1 ? true : false;
            if (compilation.sourceMap != null) {
                sourceMap = compilation.sourceMap;
            } else if (compilation.tsconfig && tsConfigInfo?.parsedConfig.options.sourceMap != null) {
                sourceMap = tsConfigInfo.parsedConfig.options.sourceMap;
            }

            // externals
            const { externals, globals } = this.getExternalsAndGlobals(compilation);

            const compileOptions: CompileOptions = {
                entryFilePath,
                outFilePath,
                bundle,
                tsConfigInfo,
                moduleFormat,
                scriptTarget,
                environmentTargets,
                externals,
                globals,
                minify,
                sourceMap,
                bannerText: this.options.bannerText,
                dryRun: this.options.dryRun,
                logLevel: this.options.logLevel
            };

            compileConfigs.push({
                // TODO:
                tools: compilation.tool ?? 'esbuild',
                options: compileOptions
            });
        }

        return compileConfigs;
    }

    private getExternalsAndGlobals(compilation: ScriptCompilation): {
        externals: string[];
        globals: Record<string, string>;
    } {
        const externalGlobalMap = new Map<string, string>();
        const externals: string[] = [];
        const excludes = compilation.externalExclude ?? this.options.scriptOptions.externalExclude ?? [];

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

    private async getCompilations(): Promise<ScriptCompilation[]> {
        if (this.options.scriptOptions.compilations === 'auto') {
            const tsConfigInfo = await this.getTsConfigInfo(null, null);
            const entryFilePath = await this.detectEntryFilePath(tsConfigInfo);

            if (!entryFilePath) {
                throw new InvalidConfigError(
                    'Could not auto detect compilations.',
                    this.options.workspaceInfo.configPath,
                    `${this.configLocationPrefix}/compilations`
                );
            }

            // TODO:
            return [
                {
                    entry: entryFilePath
                        ? normalizePathToPOSIXStyle(
                              path.relative(this.options.workspaceInfo.projectRoot, entryFilePath)
                          )
                        : undefined,
                    tsconfig: tsConfigInfo?.configPath
                        ? normalizePathToPOSIXStyle(
                              path.relative(this.options.workspaceInfo.projectRoot, tsConfigInfo.configPath)
                          )
                        : undefined
                }
            ];
        } else {
            return this.options.scriptOptions.compilations;
        }
    }

    private async getTsConfigInfo(
        compilation: ScriptCompilation | null,
        compilationIndex: number | null
    ): Promise<TsConfigInfo | null> {
        const tsConfigPath = await this.getTsConfigPath(compilation, compilationIndex);
        if (!tsConfigPath) {
            return null;
        }

        const cachedData = this.tsConfigInfoMap.get(tsConfigPath);
        if (cachedData) {
            return {
                ...cachedData,
                configPath: tsConfigPath
            };
        }

        const jsonConfig = (await readJsonWithComments(tsConfigPath)) as Record<string, unknown>;

        const parsedConfig = ts.parseJsonConfigFileContent(
            // {
            //     config?: any;
            //     error?: Diagnostic;
            // }
            { config: jsonConfig },
            ts.sys,
            path.dirname(tsConfigPath),
            undefined,
            tsConfigPath
        );

        const data = {
            jsonConfig,
            parsedConfig
        };

        this.tsConfigInfoMap.set(tsConfigPath, data);

        return {
            ...data,
            configPath: tsConfigPath
        };
    }

    private async getTsConfigPath(
        compilation: ScriptCompilation | null,
        compilationIndex: number | null
    ): Promise<string | null> {
        const tsConfigFile = compilation?.tsconfig ?? this.options.scriptOptions.tsconfig;
        if (tsConfigFile) {
            const normalizedTsConfigFile = normalizePathToPOSIXStyle(tsConfigFile);
            if (
                !normalizedTsConfigFile ||
                normalizedTsConfigFile.length < 6 ||
                !/\.json$/i.test(normalizedTsConfigFile)
            ) {
                const errMsg = `Invalid tsconfig file ${tsConfigFile}.`;
                const configLocation = compilation?.tsconfig
                    ? `${this.configLocationPrefix}/compilations/[${compilationIndex}]/tsconfig`
                    : `${this.configLocationPrefix}/tsconfig`;
                throw new InvalidConfigError(errMsg, this.options.workspaceInfo.configPath, configLocation);
            }

            const tsConfigFilePath = resolvePath(this.options.workspaceInfo.projectRoot, normalizedTsConfigFile);
            if (!(await pathExists(tsConfigFilePath))) {
                const errMsg = `The tsconfig file ${tsConfigFile} doesn't exist.`;
                const configLocation = compilation?.tsconfig
                    ? `${this.configLocationPrefix}/compilations/[${compilationIndex}]/tsconfig`
                    : `${this.configLocationPrefix}/tsconfig`;
                throw new InvalidConfigError(errMsg, this.options.workspaceInfo.configPath, configLocation);
            }

            return tsConfigFilePath;
        }

        const foundPath = await this.detectTsConfigPath();

        return foundPath;
    }

    private async detectTsConfigPath(): Promise<string | null> {
        if (this.detectedTsConfigPath !== null) {
            return this.detectedTsConfigPath.length ? this.detectedTsConfigPath : null;
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
            foundPath = await findUp(
                configFile,
                this.options.workspaceInfo.projectRoot,
                this.options.workspaceInfo.workspaceRoot
            );

            if (foundPath) {
                break;
            }
        }

        if (foundPath) {
            this.detectedTsConfigPath = foundPath;
            this.logger.debug(`${foundPath} is detected as a tsconfig file for script compilation.`);
        } else {
            this.detectedTsConfigPath = '';
        }

        return foundPath;
    }

    private async getEntryFilePath(compilation: ScriptCompilation, compilationIndex: number): Promise<string> {
        const projectRoot = this.options.workspaceInfo.projectRoot;
        const projectName = this.options.workspaceInfo.projectName;
        const configPath = this.options.workspaceInfo.configPath;
        const configLocation = `projects/${
            projectName ?? '0'
        }/tasks/build/script/compilations/[${compilationIndex}]/entry`;

        if (compilation.entry) {
            const normalizedEntry = normalizePathToPOSIXStyle(compilation.entry);

            if (!normalizedEntry || normalizedEntry.length < 4 || !supportdScriptExtRegExp.test(normalizedEntry)) {
                const errMsg = `Unsupported script entry file '${compilation.entry}'.`;
                if (projectName) {
                    throw new InvalidConfigError(errMsg, configPath, configLocation);
                } else {
                    throw new InvalidCommandOptionError('script', compilation.entry, errMsg);
                }
            }

            return resolvePath(projectRoot, normalizedEntry);
        }

        const tsConfigInfo = await this.getTsConfigInfo(compilation, compilationIndex);
        const foundEntryFilePath = await this.detectEntryFilePath(tsConfigInfo);

        if (foundEntryFilePath) {
            return foundEntryFilePath;
        }

        throw new InvalidConfigError('Could not detect entry file.', configPath, configLocation);
    }

    private async detectEntryFilePath(tsConfigInfo: TsConfigInfo | null): Promise<string | null> {
        let foundPath: string | null = null;

        if (tsConfigInfo?.parsedConfig.fileNames.length) {
            const firstFilePath = resolvePath(
                path.dirname(tsConfigInfo.configPath),
                tsConfigInfo.parsedConfig.fileNames[0]
            );

            if (await pathExists(firstFilePath)) {
                foundPath = firstFilePath;
            }
        }

        if (!foundPath) {
            if (this.lastFoundEntryFilePath !== null) {
                return this.lastFoundEntryFilePath.length ? this.lastFoundEntryFilePath : null;
            }

            const entryFiles = [
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

            if (this.options.packageJsonInfo?.packageName) {
                const packageName = this.options.packageJsonInfo.packageName;
                const lastSlashIndex = packageName.lastIndexOf('/');
                const packagenamePrefix = lastSlashIndex > -1 ? packageName.substring(lastSlashIndex + 1) : packageName;
                if (packagenamePrefix) {
                    // ts
                    entryFiles.push(`${packagenamePrefix}.mts`);
                    entryFiles.push(`${packagenamePrefix}.cts`);
                    entryFiles.push(`${packagenamePrefix}.tsx`);
                    entryFiles.push(`${packagenamePrefix}.ts`);

                    // js
                    entryFiles.push(`${packagenamePrefix}.mjs`);
                    entryFiles.push(`${packagenamePrefix}.cjs`);
                    entryFiles.push(`${packagenamePrefix}.jsx`);
                    entryFiles.push(`${packagenamePrefix}.js`);
                }
            }

            for (const entryFile of entryFiles) {
                foundPath = await findUp(entryFile, null, this.options.workspaceInfo.projectRoot);

                if (!foundPath && (await pathExists(path.resolve(this.options.workspaceInfo.projectRoot, 'src')))) {
                    foundPath = await findUp(
                        entryFile,
                        null,
                        path.resolve(this.options.workspaceInfo.projectRoot, 'src')
                    );
                }

                if (!foundPath && (await pathExists(path.resolve(this.options.workspaceInfo.projectRoot, 'lib')))) {
                    foundPath = await findUp(
                        entryFile,
                        null,
                        path.resolve(this.options.workspaceInfo.projectRoot, 'lib')
                    );
                }

                if (foundPath) {
                    break;
                }
            }

            if (foundPath) {
                this.lastFoundEntryFilePath = foundPath;
            } else {
                this.lastFoundEntryFilePath = '';
            }
        }

        if (foundPath) {
            this.logger.debug(`${foundPath} is detected as an entry file for script compilation.`);

            return foundPath;
        }

        return null;
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
        bannerText: buildTask._bannerText
    });

    return taskRunner;
}
