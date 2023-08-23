import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { LibConfig, ParsedLibConfig, ParsedProjectConfig } from '../models/index.js';
import { findUp, isInFolder, isSamePaths } from '../utils/index.js';

import { applyProjectExtends } from './apply-project-extends.js';
import { readLibConfigJsonFile } from './read-lib-config-json-file.js';

function getLibConfigInternal(libConfig: LibConfig, configPath: string, workspaceRoot: string): ParsedLibConfig {
    const parsedLibConfig: ParsedLibConfig = {
        projects: {}
    };

    for (const key of Object.keys(libConfig.projects)) {
        const project = libConfig.projects[key];

        applyProjectExtends(key, project, libConfig.projects);

        const projectRoot = project.root
            ? path.isAbsolute(project.root)
                ? path.resolve(project.root)
                : path.resolve(workspaceRoot, project.root)
            : workspaceRoot;

        if (!isSamePaths(workspaceRoot, projectRoot) && !isInFolder(workspaceRoot, projectRoot)) {
            throw new InvalidConfigError(
                `The project 'root' must not be outside of current working directory.`,
                `projects[${key}].root`
            );
        }

        const parsedProjectConfig: ParsedProjectConfig = {
            ...project,
            _workspaceRoot: workspaceRoot,
            _configPath: configPath,
            _projectName: key,
            _projectRoot: projectRoot
        };

        parsedLibConfig.projects[key] = parsedProjectConfig;
    }

    return parsedLibConfig;
}

export async function getLibConfig(configPath: string | null = null): Promise<ParsedLibConfig | null> {
    if (!configPath) {
        configPath = await findUp('libconfig.json', process.cwd(), path.parse(process.cwd()).root);
    }

    if (configPath) {
        const libConfig = await readLibConfigJsonFile(configPath, true);
        const workspaceRoot = path.extname(configPath) ? path.dirname(configPath) : configPath;

        return getLibConfigInternal(libConfig, configPath, workspaceRoot);
    }

    return null;
}
