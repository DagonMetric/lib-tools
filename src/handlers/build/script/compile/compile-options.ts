import { ParsedCommandLine } from 'typescript';

import { ScriptModuleFormat, ScriptTargetStrings } from '../../../../config-models/index.js';
import { LogLevelStrings } from '../../../../utils/index.js';

export interface TsConfigInfo {
    jsonConfig: Record<string, unknown>;
    parsedConfig: ParsedCommandLine;
    configPath: string;
}

export interface CompileOptions {
    entryFilePath: string;
    outFilePath: string;
    bundle: boolean;
    tsConfigInfo: TsConfigInfo | null;
    moduleFormat: ScriptModuleFormat;
    scriptTarget: ScriptTargetStrings;
    environmentTargets: string[];
    externals: string[];
    globals: Record<string, string>;
    sourceMap: boolean;
    minify: boolean;
    bannerText: string | null;
    dryRun: boolean | undefined;
    logLevel: LogLevelStrings;
}
