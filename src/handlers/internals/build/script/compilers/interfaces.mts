/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { CompilerOptions } from 'typescript';

import {
    ScriptModuleFormat,
    ScriptTargetStrings,
    SubstitutionEntry,
    TreeshakingOptions
} from '../../../../../config-models/index.mjs';
import { LogLevelStrings } from '../../../../../utils/index.mjs';

import { TaskInfo } from '../../../../task-info.mjs';

export interface TsConfigInfo {
    readonly compilerOptions: Readonly<CompilerOptions>;
    readonly configPath: string | undefined;
    readonly fileNames: readonly string[];
}

export interface CompileOptions {
    readonly taskInfo: Readonly<TaskInfo & { readonly compilationIndex: number | undefined }>;

    readonly entryFilePath: string | undefined;
    readonly preferredEntryFilePath: boolean | undefined;
    readonly outFilePath: string | undefined;
    readonly outDir: string;

    readonly scriptTarget: ScriptTargetStrings | undefined;
    readonly moduleFormat: ScriptModuleFormat | undefined;

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

    readonly banner: string | undefined;
    readonly footer: string | undefined;
    readonly substitutions: readonly Readonly<SubstitutionEntry>[];

    readonly dryRun: boolean;
    readonly logLevel: LogLevelStrings;
}

export interface CompileAsset {
    readonly path: string;
    readonly size: number | undefined;
    readonly isEntry: boolean | undefined;
}

export interface CompileResult {
    readonly builtAssets: readonly Readonly<CompileAsset>[];
    readonly time: number;
}
