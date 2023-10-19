/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { CompilerOptions } from 'typescript';

import {
    AssetLoader,
    ScriptModuleFormat,
    ScriptTarget,
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
    readonly outDir: string;
    readonly bundle: boolean | undefined;
    readonly entryPoints: Record<string, string> | string[] | undefined;
    readonly entryPointsPreferred: boolean | undefined;
    readonly assetLoaders: Record<string, AssetLoader> | undefined;
    readonly assetOut: string | undefined;
    readonly tsConfigInfo: Readonly<TsConfigInfo> | undefined;
    readonly scriptTarget: ScriptTarget | undefined;
    readonly moduleFormat: ScriptModuleFormat | undefined;
    readonly sourceMap: boolean | undefined;
    readonly minify: boolean | undefined;
    readonly preserveSymlinks: boolean | undefined;
    readonly environmentTargets: readonly string[] | undefined;
    readonly externals: readonly string[] | undefined;
    readonly globals: Readonly<Record<string, string>> | undefined;

    readonly globalName: string | undefined;
    readonly treeshake: boolean | Readonly<TreeshakingOptions> | undefined;

    readonly banner: string | undefined;
    readonly footer: string | undefined;
    readonly substitutions: readonly Readonly<SubstitutionEntry>[] | undefined;
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
