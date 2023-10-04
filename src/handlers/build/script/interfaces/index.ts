import { CompilerOptions } from 'typescript';

import { ScriptModuleFormat, ScriptTargetStrings, TreeshakingOptions } from '../../../../config-models/index.js';
import { SubstitutionInfo, WorkspaceInfo } from '../../../../config-models/parsed/index.js';
import { LogLevelStrings, LoggerBase } from '../../../../utils/index.js';

export interface TsConfigInfo {
    readonly compilerOptions: Readonly<CompilerOptions>;
    readonly configPath?: string;
    readonly fileNames: readonly string[];
}

export interface CompileOptions {
    readonly workspaceInfo: Readonly<WorkspaceInfo>;
    readonly compilationIndex: number;
    readonly entryFilePath: string;
    readonly outFilePath: string;
    readonly scriptTarget: ScriptTargetStrings;
    readonly moduleFormat: ScriptModuleFormat;
    readonly sourceMap: boolean;
    readonly minify: boolean;
    readonly externals: readonly string[];
    readonly globals: Record<string, string>;
    readonly substitutions: readonly Readonly<SubstitutionInfo>[];
    readonly globalName: string | undefined;
    readonly tsConfigInfo: Readonly<TsConfigInfo> | undefined;
    readonly emitDeclarationOnly: boolean | undefined;
    readonly declaration: boolean | undefined;
    readonly environmentTargets: readonly string[] | undefined;
    readonly bannerText: string | undefined;
    readonly treeshake: boolean | Readonly<TreeshakingOptions> | undefined;
    readonly preserveSymlinks: boolean | undefined;
    readonly dryRun: boolean;
    readonly logLevel: LogLevelStrings;
}

export interface CompileAsset {
    path: string;
    size: number | undefined;
}

export interface CompileResult {
    readonly builtAssets: readonly Readonly<CompileAsset>[];
    readonly time: number;
}

export type CompilerFn = (options: CompileOptions, logger: LoggerBase) => Promise<CompileResult>;
