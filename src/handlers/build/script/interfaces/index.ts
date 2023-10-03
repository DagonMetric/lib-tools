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
    readonly scriptTarget: ScriptTargetStrings;
    readonly moduleFormat: ScriptModuleFormat;
    readonly sourceMap: boolean;
    readonly minify: boolean;
    readonly globalName: string | undefined;
    readonly tsConfigInfo: TsConfigInfo | undefined;
    readonly emitDeclarationOnly: boolean | undefined;
    readonly declaration: boolean | undefined;
    readonly environmentTargets: string[] | undefined;
    readonly externals: string[] | undefined;
    readonly globals: Record<string, string> | undefined;
    readonly bannerText: string | null | undefined;
    readonly substitutions: SubstitutionInfo[] | undefined;
    readonly dryRun: boolean | undefined;
    readonly logLevel: LogLevelStrings | undefined;
}

export interface CompileResult {
    readonly builtAssets: { path: string; size: number }[];
    readonly time: number;
}

export type CompilerFn = (options: CompileOptions, logger: LoggerBase) => Promise<CompileResult>;
