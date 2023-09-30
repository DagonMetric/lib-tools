import { CompilerOptions } from 'typescript';

import { ScriptModuleFormat, ScriptTargetStrings } from '../../../../config-models/index.js';
import { SubstitutionInfo, WorkspaceInfo } from '../../../../config-models/parsed/index.js';
import { LogLevelStrings } from '../../../../utils/index.js';

export interface TsConfigInfo {
    compilerOptions: CompilerOptions;
    configPath?: string;
    fileNames: string[];
}

export interface CompileOptions {
    workspaceInfo: WorkspaceInfo;
    entryFilePath: string;
    outFilePath: string;
    bundle: boolean;
    tsConfigInfo: TsConfigInfo | null | undefined;
    moduleFormat: ScriptModuleFormat;
    scriptTarget: ScriptTargetStrings;
    environmentTargets: string[];
    externals: string[];
    globals: Record<string, string>;
    sourceMap: boolean;
    minify: boolean;
    bannerText: string | null | undefined;
    substitutions: SubstitutionInfo[];
    dryRun: boolean | undefined;
    logLevel: LogLevelStrings;
}
