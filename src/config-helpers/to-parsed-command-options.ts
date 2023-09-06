import * as path from 'node:path';

import { CommandOptions } from '../models/index.js';
import { ParsedCommandOptions } from '../models/parsed/index.js';
import { isWindowsStyleAbsolute, normalizePathToPOSIXStyle } from '../utils/index.js';

export function toParsedCommandOptions(cmdOptions: CommandOptions): ParsedCommandOptions {
    let workspaceRoot: string | null = null;
    let configPath: string | null = null;

    const projects =
        cmdOptions.project
            ?.split(',')
            .filter((projectName) => projectName && projectName.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    if (cmdOptions.workspace) {
        const pathAbs = path.isAbsolute(cmdOptions.workspace)
            ? path.resolve(cmdOptions.workspace)
            : path.resolve(process.cwd(), cmdOptions.workspace);

        if (path.extname(pathAbs)) {
            configPath = pathAbs;
            workspaceRoot = path.dirname(configPath);
        } else {
            workspaceRoot = pathAbs;
        }
    }

    const env =
        cmdOptions.env
            ?.split(',')
            .filter((envName) => envName && envName.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index)
            .reduce(
                (obj, key) => {
                    return {
                        ...obj,
                        [key]: true
                    };
                },
                {} as Record<string, boolean>
            ) ?? {};

    const outDir = cmdOptions.outDir?.trim().length
        ? isWindowsStyleAbsolute(cmdOptions.outDir) && process.platform === 'win32'
            ? path.resolve(normalizePathToPOSIXStyle(cmdOptions.outDir))
            : path.resolve(workspaceRoot ?? process.cwd(), normalizePathToPOSIXStyle(cmdOptions.outDir))
        : null;

    const copyEntries =
        cmdOptions.copy
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const styleEntries =
        cmdOptions.style
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const scriptEntries =
        cmdOptions.script
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    return {
        ...cmdOptions,
        _projects: projects,
        _workspaceRoot: workspaceRoot,
        _configPath: configPath,
        _env: env,
        _outDir: outDir,
        _copyEntries: copyEntries,
        _scriptEntries: scriptEntries,
        _styleEntries: styleEntries
    };
}
