import { InvalidConfigError } from '../exceptions/index.js';
import { ProjectConfig } from '../models/index.js';

function applyProjectExtendsInternal(
    projectName: string,
    projectConfig: ProjectConfig,
    projectCollection: Record<string, ProjectConfig>,
    prevExtends: string[]
): void {
    const projectNameToExtend = projectConfig.extends?.trim();
    if (!projectNameToExtend) {
        return;
    }

    const configLocation = `projects[${projectName}].extends`;

    if (prevExtends.includes(projectNameToExtend)) {
        throw new InvalidConfigError(
            `Cross referencing extends found with name '${projectNameToExtend}'.`,
            configLocation
        );
    }

    const baseProjectConfig = projectCollection[projectNameToExtend];
    if (!baseProjectConfig) {
        throw new InvalidConfigError(`No base project exists with name '${projectNameToExtend}'.`, configLocation);
    }

    prevExtends.push(projectNameToExtend);
    const clonedBaseProject = JSON.parse(JSON.stringify(baseProjectConfig)) as ProjectConfig;

    if (clonedBaseProject.extends) {
        applyProjectExtendsInternal(projectName, clonedBaseProject, projectCollection, prevExtends);

        delete clonedBaseProject.extends;
    }

    const extendedConfig = { ...clonedBaseProject, ...projectConfig };
    Object.assign(projectConfig, extendedConfig);
}

export function applyProjectExtends(
    projectName: string,
    projectConfig: ProjectConfig,
    projectCollection: Record<string, ProjectConfig> = {}
): void {
    if (!projectConfig.extends?.trim().length) {
        return;
    }

    const prevExtends = [projectName];
    applyProjectExtendsInternal(projectName, projectConfig, projectCollection, prevExtends);
}
