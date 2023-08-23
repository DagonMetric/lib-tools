import * as path from 'node:path';

import { InvalidCommandOptionError } from '../exceptions/index.js';
import { BuildCommandOptions, ParsedBuildCommandOptions } from '../models/index.js';
import { isInFolder } from '../utils/index.js';

import { pathExists } from '../utils/index.js';

export async function parseBuildCommandOptions(
    commandOptions: BuildCommandOptions
): Promise<ParsedBuildCommandOptions> {
    const env =
        commandOptions.env
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

    const projectNames =
        commandOptions.project
            ?.split(',')
            .filter((projectName) => projectName && projectName.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    let configPath: string | null = null;
    if (commandOptions.libconfig) {
        configPath = path.isAbsolute(commandOptions.libconfig)
            ? commandOptions.libconfig
            : path.resolve(process.cwd(), commandOptions.libconfig);

        if (!(await pathExists(configPath))) {
            throw new InvalidCommandOptionError(
                `The 'libconfig' file path that you provided in command options doesn't exist. File path: ${configPath}.`
            );
        }
    }

    const workspaceRoot = configPath ? path.dirname(configPath) : process.cwd();

    let outputPath: string | null = null;
    if (commandOptions.outputPath) {
        outputPath = path.isAbsolute(commandOptions.outputPath)
            ? path.resolve(commandOptions.outputPath)
            : path.resolve(workspaceRoot, commandOptions.outputPath);

        if (outputPath === path.parse(outputPath).root) {
            throw new InvalidCommandOptionError(`The 'outputPath' must not be the same as system root directory.`);
        }

        if (isInFolder(outputPath, workspaceRoot)) {
            throw new InvalidCommandOptionError(
                `The 'outputPath' must not be parent directory of current working directory.`
            );
        }
    }

    const copyEntries =
        commandOptions.copy
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const styleEntries =
        commandOptions.style
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const scriptEntries =
        commandOptions.script
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    return {
        ...commandOptions,
        _env: env,
        _projects: projectNames,
        _configPath: configPath,
        _outputPath: outputPath,
        _copyEntries: copyEntries,
        _styleEntries: styleEntries,
        _scriptEntries: scriptEntries
    };
}
