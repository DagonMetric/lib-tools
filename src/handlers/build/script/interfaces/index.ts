import { CompilerOptions } from 'typescript';

import { ScriptModuleFormat, ScriptTargetStrings, TreeshakingOptions } from '../../../../config-models/index.js';
import { SubstitutionInfo, WorkspaceInfo } from '../../../../config-models/parsed/index.js';
import { LogLevelStrings, Logger } from '../../../../utils/index.js';

export interface TsConfigInfo {
    readonly compilerOptions: Readonly<CompilerOptions>;
    readonly configPath: string | undefined;
    readonly fileNames: readonly string[];
}

export interface CompileOptions {
    readonly workspaceInfo: Readonly<WorkspaceInfo>;
    readonly compilationIndex: number | undefined;
    readonly entryFilePath: string;
    readonly outFilePath: string;
    readonly scriptTarget: ScriptTargetStrings;
    readonly moduleFormat: ScriptModuleFormat;
    readonly sourceMap: boolean;
    readonly minify: boolean;
    readonly tsConfigInfo: Readonly<TsConfigInfo> | undefined;
    readonly emitDeclarationOnly: boolean | undefined;
    readonly declaration: boolean | undefined;
    readonly environmentTargets: readonly string[] | undefined;
    readonly externals: readonly string[] | undefined;
    readonly globals: Readonly<Record<string, string>> | undefined;
    readonly preserveSymlinks: boolean | undefined;
    readonly globalName: string | undefined;
    readonly treeshake: boolean | Readonly<TreeshakingOptions> | undefined;
    readonly bannerText: string | undefined;
    readonly footerText: string | undefined;
    readonly substitutions: readonly Readonly<SubstitutionInfo>[];
    readonly dryRun: boolean;
    readonly logLevel: LogLevelStrings;
}

export interface CompileAsset {
    readonly path: string;
    readonly size: number | undefined;
}

export interface CompileResult {
    readonly builtAssets: readonly Readonly<CompileAsset>[];
    readonly time: number;
}

export type CompilerFn = (options: CompileOptions, logger: Logger) => Promise<CompileResult>;
