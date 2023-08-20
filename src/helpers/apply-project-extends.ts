import * as path from 'path';

import { InvalidConfigError } from '../exceptions/index.js';
import { ParsedProjectConfig } from '../models/index.js';
import { pathExists } from '../utils/index.js';

import { readLibConfigFile } from './read-lib-config-file.js';
import { toParsedLibConfig } from './parse-lib-config.js';

export async function applyProjectExtends(
    projectConfig: ParsedProjectConfig,
    projects: Record<string, ParsedProjectConfig> | ParsedProjectConfig[] = {},
    configPath: string
): Promise<void> {
    if (configPath === 'auto' || !projectConfig.extends?.trim().length) {
        return;
    }

    let projectCollection: Record<string, ParsedProjectConfig> = {};
    if (Array.isArray(projects)) {
        projects.forEach((project) => {
            projectCollection[project._projectName] = project;
        });
    } else {
        projectCollection = projects;
    }

    await applyProjectExtendsInternal(projectConfig, projectCollection, configPath);
}

async function applyProjectExtendsInternal(
    projectConfig: ParsedProjectConfig,
    projectCollection: Record<string, ParsedProjectConfig> = {},
    rootConfigPath: string
): Promise<void> {
    if (!projectConfig.extends) {
        return;
    }

    const currentConfigFile =
        projectConfig._config === rootConfigPath ? path.parse(rootConfigPath).base : projectConfig._config;
    const configErrorLocation = `projects[${projectConfig._projectName}].extends`;
    let baseProjectConfig: ParsedProjectConfig | null;

    if (projectConfig.extends.startsWith('project:')) {
        baseProjectConfig = getBaseProjectConfigFromProjectCollection(projectConfig, projectCollection, rootConfigPath);
    } else if (projectConfig.extends.startsWith('file:')) {
        baseProjectConfig = await getBaseProjectConfigFromFile(projectConfig, rootConfigPath);
    } else {
        throw new InvalidConfigError(
            `Error in extending project config. Invalid extends name, config location ${currentConfigFile} -> ${configErrorLocation}.`
        );
    }

    if (!baseProjectConfig) {
        return;
    }

    const clonedBaseProject = JSON.parse(JSON.stringify(baseProjectConfig)) as ParsedProjectConfig;
    if (clonedBaseProject.extends) {
        await applyProjectExtendsInternal(clonedBaseProject, projectCollection, rootConfigPath);

        delete clonedBaseProject.extends;
    }

    const extendedConfig = { ...clonedBaseProject, ...projectConfig };
    Object.assign(projectConfig, extendedConfig);
}

function getBaseProjectConfigFromProjectCollection(
    projectConfig: ParsedProjectConfig,
    projectCollection: Record<string, ParsedProjectConfig> = {},
    rootConfigPath: string
): ParsedProjectConfig | null {
    if (!projectConfig.extends) {
        return null;
    }

    const currentConfigFile =
        projectConfig._config === rootConfigPath ? path.parse(rootConfigPath).base : projectConfig._config;
    const configErrorLocation = `projects[${projectConfig._projectName}].extends`;

    const projectNameToExtend = projectConfig.extends.substr('project:'.length).trim();
    if (!projectNameToExtend) {
        throw new InvalidConfigError(
            `Error in extending project config. Invalid extends name, config location ${currentConfigFile} -> ${configErrorLocation}.`
        );
    }

    const foundBaseProject = projectCollection[projectNameToExtend];
    if (!foundBaseProject) {
        throw new InvalidConfigError(
            `Error in extending project config. No base project config exists with name '${projectNameToExtend}', config location ${currentConfigFile} -> ${configErrorLocation}.`
        );
    }

    if (foundBaseProject._projectName === projectConfig._projectName) {
        throw new InvalidConfigError(
            `Error in extending project config. Base project name must not be the same as current project name, config location ${currentConfigFile} -> ${configErrorLocation}.`
        );
    }

    return foundBaseProject;
}

async function getBaseProjectConfigFromFile(
    projectConfig: ParsedProjectConfig,
    rootConfigPath: string
): Promise<ParsedProjectConfig | null> {
    if (!projectConfig.extends) {
        return null;
    }

    const currentConfigFile =
        projectConfig._config === rootConfigPath ? path.parse(rootConfigPath).base : projectConfig._config;
    const configErrorLocation = `projects[${projectConfig._projectName}].extends`;

    const parts = projectConfig.extends.split(':');
    if (parts.length !== 3) {
        throw new InvalidConfigError(
            `Error in extending project config. Invalid extends name, config location ${currentConfigFile} -> ${configErrorLocation}.`
        );
    }

    const extendsFilePath = path.isAbsolute(parts[1])
        ? path.resolve(parts[1])
        : path.resolve(path.dirname(projectConfig._config || rootConfigPath), parts[1]);

    if (!(await pathExists(extendsFilePath))) {
        throw new InvalidConfigError(
            `Error in extending project config. No file exists at ${extendsFilePath}, config location ${currentConfigFile} -> ${configErrorLocation}.`
        );
    }

    try {
        const projectNameToExtend = parts[2];
        const libConfig = await readLibConfigFile(extendsFilePath, true);
        const foundBaseProject = libConfig.projects[projectNameToExtend];
        if (!foundBaseProject) {
            throw new InvalidConfigError(
                `Error in extending project config. No base project config exists with name '${projectNameToExtend}', config location ${currentConfigFile} -> ${configErrorLocation}.`
            );
        }

        const libConfigInternal = toParsedLibConfig(libConfig, extendsFilePath, projectConfig._workspaceRoot);
        const foundBaseProjectInternal = libConfigInternal.projects[projectNameToExtend];

        if (foundBaseProjectInternal._projectName === projectConfig._projectName) {
            throw new InvalidConfigError(
                `Error in extending project config. Base project name must not be the same as current project name, config location ${currentConfigFile} -> ${configErrorLocation}.`
            );
        }

        return {
            ...foundBaseProjectInternal,
            _config: extendsFilePath,
            _workspaceRoot: projectConfig._workspaceRoot,
            _projectName: projectConfig._projectName,
            _projectRoot: projectConfig._projectRoot
        };
    } catch (err) {
        throw new InvalidConfigError(
            `Error in extending project config, could not read file '${extendsFilePath}'. Config location ${currentConfigFile} -> ${configErrorLocation}.`
        );
    }
}
