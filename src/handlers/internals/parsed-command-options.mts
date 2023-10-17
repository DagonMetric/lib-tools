/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { CommandOptions } from '../../config-models/index.mjs';

export interface ParsedCommandOptions
    extends Readonly<Pick<CommandOptions, 'logLevel' | 'dryRun' | 'env' | 'clean' | 'packageVersion'>> {
    readonly workspaceRoot: string;
    readonly configPath: string | null;
    readonly projects: readonly string[];

    // For build
    readonly outDir: string | null;
    readonly copy: readonly string[];
    readonly style: readonly string[];
    readonly script: readonly string[];
}
