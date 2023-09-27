import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// eslint-disable-next-line import/default
import ts from 'typescript';

import {
    ScriptCompilation,
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
    resolvePath
} from '../../../utils/index.js';

import { BuildTaskHandleContext } from '../../interfaces/index.js';
import { CompileOptions, TsConfigInfo } from './compile/compile-options.js';

const supportdEntryExtPattern = '\\.(tsx|mts|cts|ts|jsx|mjs|cjs|js)$';
const supportdEntryExtRegExp = new RegExp(supportdEntryExtPattern, 'i');
const supportedOutExtRegExp = /\.(d\.ts|mjs|cjs|json|jsx?)$/i;
const tsConfigPathsCache = new Map<string, string>();
const tsConfigInfoCache = new Map<string, TsConfigInfo>();
const entryFilePathsCache = new Map<string, string>();

type ScriptCompilationTools = 'esbuild' | 'webpack' | 'rollup';

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
    private readonly configLocationPrefix: string;

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

            const tsConfigPath = await this.getTsConfigPath(compilation, i);
            const tsConfigInfo = tsConfigPath ? await this.getTsConfigInfo(tsConfigPath, compilation, i) : null;
            const entryFilePath = await this.getEntryFilePath(compilation, i);
            const scriptTarget = this.getScriptTarget(compilation, tsConfigInfo);
            const moduleFormat = this.getModuleFormat(compilation, tsConfigInfo, entryFilePath);
            const outFilePath = this.getOutputFilePath(
                compilation,
                i,
                entryFilePath,
                compilation.emitDeclarationOnly,
                tsConfigInfo,
                moduleFormat,
                scriptTarget
            );

            // environmentTargets
            const environmentTargets: string[] =
                compilation.environmentTargets ?? this.options.scriptOptions.environmentTargets ?? [];

            // minify
            let minify = compilation.bundle !== false && moduleFormat === 'iife' ? true : false;
            if (compilation.minify != null) {
                minify = compilation.minify;
            }

            // sourceMap
            let sourceMap = compilation.bundle !== false || compilations.length === 1 ? true : false;
            if (compilation.sourceMap != null) {
                sourceMap = compilation.sourceMap;
            } else if (compilation.tsconfig && tsConfigInfo?.parsedConfig.options.sourceMap != null) {
                sourceMap = tsConfigInfo.parsedConfig.options.sourceMap;
            }

            // externals
            const { externals, globals } = this.getExternalsAndGlobals(compilation);

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

            const compileOptions: CompileOptions = {
                entryFilePath,
                outFilePath,
                bundle: compilation.bundle !== false,
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
                tools: 'esbuild',
                options: compileOptions
            });
        }

        return compileConfigs;
    }

    private async getCompilations(): Promise<ScriptCompilation[]> {
        if (this.options.scriptOptions.compilations === 'auto') {
            this.logger.debug('Auto detecting script compilations...');

            const tsConfigPath = await this.detectTsConfigPath();
            const tsConfigInfo = tsConfigPath ? await this.getTsConfigInfo(tsConfigPath, null, null) : null;
            const entryFilePath = await this.detectEntryFilePath(tsConfigInfo);

            if (!entryFilePath) {
                throw new InvalidConfigError(
                    `Could not detect compilations automatically. Specify 'compilations' in script options.`,
                    this.options.workspaceInfo.configPath,
                    `${this.configLocationPrefix}/compilations`
                );
            }

            const compilations: ScriptCompilation[] = [];

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
                (tsConfigInfo.parsedConfig.options.module as number) > 3 &&
                (tsConfigInfo.parsedConfig.options.module as number) < 100 &&
                (tsConfigInfo.parsedConfig.options.target as number) > 1 &&
                (tsConfigInfo.parsedConfig.options.target as number) < 100
            ) {
                const scriptTarget = this.getScriptTarget(null, tsConfigInfo) ?? 'ESNext';
                const year = this.getYearFromScriptTarget(scriptTarget);

                // types
                compilations.push({
                    bundle: false,
                    entry,
                    tsconfig,
                    declaration: true,
                    emitDeclarationOnly: true
                });

                // esm
                compilations.push({
                    bundle: false,
                    entry,
                    tsconfig,
                    declaration: true,
                    scriptTarget,
                    moduleFormat: 'esm',
                    out: `esm${year}`
                });

                // fesm
                compilations.push({
                    bundle: true,
                    entry,
                    tsconfig,
                    declaration: false,
                    scriptTarget,
                    moduleFormat: 'esm',
                    out: `fesm${year}`
                });
            } else {
                let moduleFormat = this.getModuleFormat(null, tsConfigInfo, entryFilePath);
                if (!moduleFormat) {
                    moduleFormat = 'iife';
                }

                let scriptTarget = this.getScriptTarget(null, tsConfigInfo);
                if (!scriptTarget) {
                    scriptTarget = moduleFormat === 'iife' ? 'ES5' : 'ESNext';
                }

                compilations.push({
                    bundle: true,
                    entry,
                    tsconfig,
                    moduleFormat,
                    scriptTarget
                });
            }

            return compilations;
        } else {
            // Validations
            //
            if (!this.options.scriptOptions.compilations.length) {
                throw new InvalidConfigError(
                    'No compilation options.',
                    this.options.workspaceInfo.configPath,
                    `${this.configLocationPrefix}/scriptOptions/compilations`
                );
            }

            const processedOutKeys: string[] = [];

            for (let i = 0; i < this.options.scriptOptions.compilations.length; i++) {
                const compilation = this.options.scriptOptions.compilations[i];

                if (!Object.keys(compilation).length) {
                    throw new InvalidConfigError(
                        'Invalid empty compilation options.',
                        this.options.workspaceInfo.configPath,
                        `${this.configLocationPrefix}/scriptOptions/${i}`
                    );
                }

                const out = compilation.out ?? '';
                const bundle = compilation.bundle ? 'bundle' : '';
                const moduleFormat = compilation.moduleFormat ?? '';
                const scriptTarget = compilation.scriptTarget ?? '';
                const tsconfig = compilation.tsconfig ?? this.options.scriptOptions.tsconfig ?? '';
                const declaration = compilation.declaration ? 'declaration' : '';
                const declarationOnly = compilation.emitDeclarationOnly ? 'declarationOnly' : '';

                const outKey = `${out}!${bundle}!${moduleFormat}!${scriptTarget}!${tsconfig}!${declaration}!${declarationOnly}`;

                if (processedOutKeys.includes(outKey)) {
                    throw new InvalidConfigError(
                        'Duplicate compilation output options.',
                        this.options.workspaceInfo.configPath,
                        `${this.configLocationPrefix}/scriptOptions/${i}`
                    );
                }

                processedOutKeys.push(outKey);
            }

            return this.options.scriptOptions.compilations;
        }
    }

    private async getTsConfigInfo(
        tsConfigPath: string,
        compilation: ScriptCompilation | null,
        compilationIndex: number | null
    ): Promise<TsConfigInfo> {
        const cachedTsConfigInfo = tsConfigInfoCache.get(tsConfigPath);
        if (cachedTsConfigInfo) {
            return cachedTsConfigInfo;
        }

        const jsonText = await fs.readFile(tsConfigPath, 'utf-8');

        // eslint-disable-next-line import/no-named-as-default-member
        const configJson = ts.parseConfigFileTextToJson(tsConfigPath, jsonText);

        if (!configJson.config || configJson.error) {
            const tsMsg = configJson.error
                ? // eslint-disable-next-line import/no-named-as-default-member
                  '\n' + ts.flattenDiagnosticMessageText(configJson.error.messageText, '\n').trim()
                : '';
            const tsConfigPathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), tsConfigPath));
            const errMsg = `Invalid tsconfig file ${tsConfigPathRel}.${tsMsg}`;
            const configLocation = compilation?.tsconfig
                ? `${this.configLocationPrefix}/compilations/[${compilationIndex}]/tsconfig`
                : `${this.configLocationPrefix}/tsconfig`;
            throw new InvalidConfigError(errMsg, this.options.workspaceInfo.configPath, configLocation);
        }

        // eslint-disable-next-line import/no-named-as-default-member
        const parsedConfig = ts.parseJsonConfigFileContent(configJson.config, ts.sys, path.dirname(tsConfigPath));

        if (parsedConfig.errors.length) {
            const tsMsg = parsedConfig.errors
                // eslint-disable-next-line import/no-named-as-default-member
                .map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n').trim())
                .join('\n');

            const tsConfigPathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), tsConfigPath));
            const errMsg = `Invalid tsconfig file ${tsConfigPathRel}.${tsMsg}`;
            const configLocation = compilation?.tsconfig
                ? `${this.configLocationPrefix}/compilations/[${compilationIndex}]/tsconfig`
                : `${this.configLocationPrefix}/tsconfig`;
            throw new InvalidConfigError(errMsg, this.options.workspaceInfo.configPath, configLocation);
        }

        const tsConfigInfo: TsConfigInfo = {
            configPath: tsConfigPath,
            jsonConfig: configJson.config as Record<string, unknown>,
            parsedConfig
        };

        tsConfigInfoCache.set(tsConfigPath, tsConfigInfo);

        return tsConfigInfo;
    }

    private async getTsConfigPath(
        compilation: ScriptCompilation | null,
        compilationIndex: number | null
    ): Promise<string | null> {
        const tsConfigFile = compilation?.tsconfig ?? this.options.scriptOptions.tsconfig;
        if (tsConfigFile) {
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
                const errMsg = `Invalid tsconfig file ${tsConfigFile}.`;
                const configLocation = compilation?.tsconfig
                    ? `${this.configLocationPrefix}/compilations/[${compilationIndex}]/tsconfig`
                    : `${this.configLocationPrefix}/tsconfig`;
                throw new InvalidConfigError(errMsg, this.options.workspaceInfo.configPath, configLocation);
            }

            const tsConfigFilePath = resolvePath(projectRoot, normalizedTsConfigFile);

            if (!(await pathExists(tsConfigFilePath, true))) {
                const errMsg = `The tsconfig file ${tsConfigFile} doesn't exist.`;
                const configLocation = compilation?.tsconfig
                    ? `${this.configLocationPrefix}/compilations/[${compilationIndex}]/tsconfig`
                    : `${this.configLocationPrefix}/tsconfig`;
                throw new InvalidConfigError(errMsg, this.options.workspaceInfo.configPath, configLocation);
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

        this.logger.debug('Detecting tsconfig file...');

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

            const relPath = normalizePathToPOSIXStyle(path.relative(process.cwd(), foundPath));
            this.logger.debug(`${relPath} is detected as a tsconfig file.`);
        } else {
            tsConfigPathsCache.set(cacheKey, '');
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
            : null;

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

    private async detectEntryFilePath(tsConfigInfo: TsConfigInfo | null): Promise<string | null> {
        let packagenamePrefix: string | null = null;
        if (this.options.packageJsonInfo?.packageName) {
            const packageName = this.options.packageJsonInfo.packageName;
            const lastSlashIndex = packageName.lastIndexOf('/');
            packagenamePrefix = lastSlashIndex > -1 ? packageName.substring(lastSlashIndex + 1) : packageName;
        }

        if (tsConfigInfo?.parsedConfig.fileNames.length) {
            const cacheKey = tsConfigInfo.configPath;
            const cached = entryFilePathsCache.get(cacheKey);
            if (cached) {
                return cached;
            }

            this.logger.debug('Detecting entry file...');

            let foundPath = tsConfigInfo.parsedConfig.fileNames[0];

            if (packagenamePrefix) {
                const fileNameTestRegExp = new RegExp('[\\/]' + packagenamePrefix + supportdEntryExtPattern, 'i');
                for (const filePath of tsConfigInfo.parsedConfig.fileNames) {
                    if (fileNameTestRegExp.test(filePath)) {
                        foundPath = filePath;
                        break;
                    }
                }
            }

            entryFilePathsCache.set(cacheKey, foundPath);

            const relPath = normalizePathToPOSIXStyle(path.relative(process.cwd(), foundPath));
            this.logger.debug(`${relPath} is detected as an entry file.`);

            return foundPath;
        } else {
            const projectRoot = this.options.workspaceInfo.projectRoot;
            const cacheKey = projectRoot;
            const cached = entryFilePathsCache.get(cacheKey);
            if (cached !== null) {
                return cached?.length ? cached : null;
            }

            this.logger.debug('Detecting entry file...');

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

            if (packagenamePrefix) {
                // ts
                packageNameEntryNames.push(`${packagenamePrefix}.mts`);
                packageNameEntryNames.push(`${packagenamePrefix}.cts`);
                packageNameEntryNames.push(`${packagenamePrefix}.tsx`);
                packageNameEntryNames.push(`${packagenamePrefix}.ts`);

                // js
                packageNameEntryNames.push(`${packagenamePrefix}.mjs`);
                packageNameEntryNames.push(`${packagenamePrefix}.cjs`);
                packageNameEntryNames.push(`${packagenamePrefix}.jsx`);
                packageNameEntryNames.push(`${packagenamePrefix}.js`);
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
        tsConfigInfo: TsConfigInfo | null,
        moduleFormat: ScriptModuleFormat | undefined,
        scriptTarget: ScriptTargetStrings | undefined
    ): string {
        const entryFileName = path.basename(entryFilePath);
        const entryFileExt = path.extname(entryFileName);
        let suggestedOutFileExt = '.js';
        if (forTypesOutput) {
            suggestedOutFileExt = '.d.ts';
        } else if (scriptTarget === 'JSON') {
            suggestedOutFileExt = '.json';
        } else if (
            moduleFormat === 'esm' &&
            scriptTarget !== 'ES5' &&
            scriptTarget !== 'ES3' &&
            /\.m(t|j)s$/i.test(entryFileExt)
        ) {
            suggestedOutFileExt = '.mjs';
        } else if (
            moduleFormat === 'cjs' &&
            scriptTarget !== 'ES5' &&
            scriptTarget !== 'ES3' &&
            /\.c(t|j)s$/i.test(entryFileExt)
        ) {
            suggestedOutFileExt = '.cjs';
        } else if (/\.(t|j)sx$/i.test(entryFileExt)) {
            suggestedOutFileExt = '.jsx';
        }

        if (compilation.out?.trim().length) {
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
                if (forTypesOutput && !/\.d\.ts$/i.test(normalziedOutExt)) {
                    throw new InvalidConfigError(
                        `To use 'emitDeclarationOnly' options, output file extension must be .d.ts.`,
                        this.options.workspaceInfo.configPath,
                        `${this.configLocationPrefix}/compilations/[${compilationIndex}]/out`
                    );
                } else if (scriptTarget === 'JSON' && !/\.json$/i.test(normalziedOutExt)) {
                    throw new InvalidConfigError(
                        `To use 'JSON' scriptTarget, output file extension must be .json.`,
                        this.options.workspaceInfo.configPath,
                        `${this.configLocationPrefix}/compilations/[${compilationIndex}]/out`
                    );
                }

                outFilePath = resolvePath(this.options.outDir, normalziedOut);
            } else {
                const outFileName =
                    entryFileName.substring(0, entryFileName.length - entryFileExt.length) + suggestedOutFileExt;
                outFilePath = resolvePath(this.options.outDir, path.join(normalziedOut, outFileName));
            }

            if (isSamePaths(outFilePath, entryFilePath)) {
                throw new InvalidConfigError(
                    'The compilation output path must not be the same as entry file path.',
                    this.options.workspaceInfo.configPath,
                    `${this.configLocationPrefix}/compilations/[${compilationIndex}]/out`
                );
            }

            if (!isInFolder(this.options.outDir, outFilePath) && !isSamePaths(this.options.outDir, outFilePath)) {
                throw new InvalidConfigError(
                    'The compilation output path must not be outside of project outDir.',
                    this.options.workspaceInfo.configPath,
                    `${this.configLocationPrefix}/compilations/[${compilationIndex}]/out`
                );
            }

            return outFilePath;
        } else {
            this.logger.debug('Detecting output file...');

            let customOutDir = this.options.outDir;
            let outFileName =
                entryFileName.substring(0, entryFileName.length - entryFileExt.length) + suggestedOutFileExt;

            if (
                tsConfigInfo?.parsedConfig.options.outFile != null &&
                (compilation.moduleFormat === 'iife' ||
                    // eslint-disable-next-line import/no-named-as-default-member
                    tsConfigInfo?.parsedConfig.options.module === ts.ModuleKind.None ||
                    // eslint-disable-next-line import/no-named-as-default-member
                    tsConfigInfo?.parsedConfig.options.module === ts.ModuleKind.AMD ||
                    // eslint-disable-next-line import/no-named-as-default-member
                    tsConfigInfo?.parsedConfig.options.module === ts.ModuleKind.System)
            ) {
                const tsOutFileName = path.basename(tsConfigInfo.parsedConfig.options.outFile);
                const tsOutFileExt = path.extname(tsOutFileName);
                outFileName =
                    tsOutFileName.substring(0, tsOutFileName.length - tsOutFileExt.length) + suggestedOutFileExt;
            }

            if (tsConfigInfo?.parsedConfig.options.outDir != null) {
                customOutDir = path.resolve(tsConfigInfo.parsedConfig.options.outDir);
            } else {
                const projectRoot = this.options.workspaceInfo.projectRoot;
                const workspaceRoot = this.options.workspaceInfo.workspaceRoot;
                if (!isSamePaths(projectRoot, workspaceRoot)) {
                    const relToWorkspaceRoot = normalizePathToPOSIXStyle(path.relative(workspaceRoot, projectRoot));
                    if (relToWorkspaceRoot.split('/').length > 1) {
                        customOutDir = resolvePath(this.options.outDir, relToWorkspaceRoot);
                    }
                }

                if (
                    !forTypesOutput &&
                    moduleFormat === 'esm' &&
                    scriptTarget &&
                    scriptTarget !== 'ES5' &&
                    scriptTarget !== 'ES3' &&
                    scriptTarget !== 'JSON'
                ) {
                    const year = this.getYearFromScriptTarget(scriptTarget);

                    if (year > 2014) {
                        customOutDir =
                            compilation.bundle !== false
                                ? path.resolve(customOutDir, `fesm${year}`)
                                : path.resolve(customOutDir, `esm${year}`);
                    }
                }
            }

            if (!isInFolder(this.options.outDir, customOutDir) && !isSamePaths(this.options.outDir, customOutDir)) {
                customOutDir = this.options.outDir;
            }

            const outputPath = resolvePath(customOutDir, outFileName);

            const relPath = normalizePathToPOSIXStyle(path.relative(process.cwd(), outputPath));
            this.logger.debug(`${relPath} will be used as a main output file.`);

            return outputPath;
        }
    }

    private getYearFromScriptTarget(scriptTarget: ScriptTargetStrings): number {
        if (scriptTarget === 'ESNext' || scriptTarget === 'Latest') {
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
        tsConfigInfo: TsConfigInfo | null
    ): ScriptTargetStrings | undefined {
        if (compilation?.scriptTarget) {
            return compilation.scriptTarget;
        }

        if (tsConfigInfo?.parsedConfig.options.target) {
            // eslint-disable-next-line import/no-named-as-default-member
            return ts.ScriptTarget[tsConfigInfo.parsedConfig.options.target] as ScriptTargetStrings;
        }

        return undefined;
    }

    private getModuleFormat(
        compilation: ScriptCompilation | null,
        tsConfigInfo: TsConfigInfo | null,
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

        if (tsConfigInfo?.parsedConfig.options.module != null) {
            const moduleKind = tsConfigInfo.parsedConfig.options.module;
            // eslint-disable-next-line import/no-named-as-default-member
            if (moduleKind === ts.ModuleKind.CommonJS) {
                return 'cjs';
            }

            if (
                // eslint-disable-next-line import/no-named-as-default-member
                moduleKind === ts.ModuleKind.UMD ||
                // eslint-disable-next-line import/no-named-as-default-member
                moduleKind === ts.ModuleKind.AMD ||
                // eslint-disable-next-line import/no-named-as-default-member
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
            environmentTargets.find((e) => e.startsWith('node')) == null
        ) {
            return 'iife';
        }

        return undefined;
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
