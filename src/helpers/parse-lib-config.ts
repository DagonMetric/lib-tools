import * as path from 'node:path';

import { InternalError, InvalidCommandOptionError, InvalidConfigError } from '../exceptions/index.js';
import { CommandOptions, LibConfig, ParsedLibConfig, ParsedProjectConfig } from '../models/index.js';
import { findUp, pathExists } from '../utils/index.js';

import { detectLibConfig } from './detect-lib-config.js';
import { readLibConfigJsonFile } from './read-lib-config-json-file.js';

export async function parseLibConfig(commandOptions: CommandOptions): Promise<ParsedLibConfig> {
    let configPath: string | null = null;

    if (commandOptions.libconfig && commandOptions.libconfig !== 'auto') {
        configPath = path.isAbsolute(commandOptions.libconfig)
            ? commandOptions.libconfig
            : path.resolve(process.cwd(), commandOptions.libconfig);

        if (!(await pathExists(configPath))) {
            throw new InvalidCommandOptionError(
                `The configuration file path that you provided in command options doesn't exist. File path: ${configPath}.`
            );
        }
    }

    if (!configPath) {
        configPath = await findUp(['libconfig.json'], process.cwd(), path.parse(process.cwd()).root);
    }

    if (configPath) {
        const libConfig = await readLibConfigJsonFile(configPath, true);
        const workspaceRoot = path.extname(configPath) ? path.dirname(configPath) : configPath;

        return toParsedLibConfig(libConfig, configPath, workspaceRoot);
    } else {
        const libConfig = await detectLibConfig();

        if (libConfig == null) {
            throw new InternalError(`The lib workflow configuration could not be detected automatically.`);
        }

        return libConfig;
    }
}

export function toParsedLibConfig(libConfig: LibConfig, configPath: string, workspaceRoot: string): ParsedLibConfig {
    const parsedLibConfig: ParsedLibConfig = {
        projects: {}
    };

    const keys = Object.keys(libConfig.projects);

    for (const key of keys) {
        const project = libConfig.projects[key];

        if (project.root && path.isAbsolute(project.root)) {
            throw new InvalidConfigError(`The 'projects[${key}].root' must be relative path.`);
        }

        const projectRoot = path.resolve(workspaceRoot, project.root ?? '');
        const parsedProjectConfig: ParsedProjectConfig = {
            ...project,
            _workspaceRoot: workspaceRoot,
            _config: configPath,
            _projectName: key,
            _projectRoot: projectRoot
        };

        parsedLibConfig.projects[key] = parsedProjectConfig;
    }

    return parsedLibConfig;
}
