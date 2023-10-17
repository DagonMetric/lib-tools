/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
/**
 * Build command options.
 */
export interface BuildCommandOptions {
    outDir?: string;
    clean?: boolean;
    copy?: string;
    style?: string;
    script?: string;
    packageVersion?: string;
}

/**
 * Command options. *
 */
// Important Note: To sync with command builder options in cli/commands/run.ts
export interface CommandOptions extends BuildCommandOptions {
    workspace?: string;
    project?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    dryRun?: boolean;
    env?: string;
}
