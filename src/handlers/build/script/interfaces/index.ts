import { CompilerOptions } from 'typescript';

import { ScriptModuleFormat, ScriptTargetStrings } from '../../../../config-models/index.js';
import { SubstitutionInfo, WorkspaceInfo } from '../../../../config-models/parsed/index.js';
import { LogLevelStrings, LoggerBase } from '../../../../utils/index.js';

export interface TsConfigInfo {
    readonly compilerOptions: CompilerOptions;
    readonly configPath?: string;
    readonly fileNames: string[];
}

export interface CompileOptions {
    readonly workspaceInfo: WorkspaceInfo;
    readonly entryFilePath: string;
    readonly outFilePath: string;
    readonly tsConfigInfo: TsConfigInfo | null | undefined;
    readonly emitDeclarationOnly: boolean;
    readonly declaration: boolean | undefined;
    readonly moduleFormat: ScriptModuleFormat;
    readonly scriptTarget: ScriptTargetStrings;
    readonly environmentTargets: string[];
    readonly externals: string[];
    readonly globals: Record<string, string>;
    readonly globalName: string | undefined;
    readonly sourceMap: boolean;
    readonly minify: boolean;
    readonly bannerText: string | null | undefined;
    readonly substitutions: SubstitutionInfo[];
    readonly dryRun: boolean | undefined;
    readonly logLevel: LogLevelStrings;
}

export interface CompileResult {
    readonly builtAssets: { path: string; size: number }[];
    readonly time: number;
}

export type CompilerFn = (options: CompileOptions, logger: LoggerBase) => Promise<CompileResult>;
