/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { CommandOptions } from '../../config-models/index.mjs';
import { pathExists, resolvePath } from '../../utils/index.mjs';

import { InvalidCommandOptionError } from '../exceptions/index.mjs';

import { ParsedCommandOptions } from './parsed-command-options.mjs';

export async function getParsedCommandOptions(cmdOptions: Readonly<CommandOptions>): Promise<ParsedCommandOptions> {
    let workspaceRoot = process.cwd();
    let configPath: string | null = null;

    if (cmdOptions.workspace?.trim().length) {
        const pathAbs = resolvePath(process.cwd(), cmdOptions.workspace);

        if (path.extname(pathAbs) && /\.json$/i.test(pathAbs)) {
            configPath = pathAbs;
            workspaceRoot = path.dirname(configPath);
        } else {
            workspaceRoot = pathAbs;
        }
    }

    // Validations
    if (configPath) {
        if (!(await pathExists(configPath, true))) {
            throw new InvalidCommandOptionError(
                'workspace',
                cmdOptions.workspace,
                `The workspace config file doesn't exist.`
            );
        } else {
            const configFileStats = await fs.stat(configPath);
            if (!configFileStats.isFile()) {
                throw new InvalidCommandOptionError(
                    'workspace',
                    cmdOptions.workspace,
                    `Config path ${configPath} must be a file.`
                );
            }
        }
    }

    if (cmdOptions.workspace) {
        if (!(await pathExists(workspaceRoot, true))) {
            throw new InvalidCommandOptionError(
                'workspace',
                cmdOptions.workspace,
                `The workspace directory doesn't exist.`
            );
        }
    }

    const projects =
        cmdOptions.project
            ?.split(',')
            .filter((projectName) => projectName && projectName.trim().length > 0)
            .map((projectName) => projectName.trim())
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    // For build task
    //
    const outDir = cmdOptions.outDir?.trim().length ? resolvePath(workspaceRoot, cmdOptions.outDir) : null;

    const copy =
        cmdOptions.copy
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .map((p) => p.trim())
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const style =
        cmdOptions.style
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .map((p) => p.trim())
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const script =
        cmdOptions.script
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .map((p) => p.trim())
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const parsedCommandOptions: ParsedCommandOptions = {
        ...cmdOptions,
        projects,
        workspaceRoot,
        configPath,
        outDir,
        copy,
        script,
        style
    };

    return parsedCommandOptions;
}
