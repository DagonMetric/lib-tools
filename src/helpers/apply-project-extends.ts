import { InvalidConfigError } from '../exceptions/index.js';
import { BuildTaskConfig, ProjectConfig } from '../models/index.js';

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
        throw new InvalidConfigError('Cross referencing extend founds.', configLocation);
    }

    const baseProjectConfig = projectCollection[projectNameToExtend];
    if (!baseProjectConfig) {
        throw new InvalidConfigError('No base project to extend.', configLocation);
    }

    prevExtends.push(projectNameToExtend);

    if (baseProjectConfig.extends) {
        applyProjectExtendsInternal(projectName, baseProjectConfig, projectCollection, prevExtends);
    }

    if (baseProjectConfig.tasks?.build) {
        const baseBuildConfig = JSON.parse(JSON.stringify(baseProjectConfig.tasks.build)) as BuildTaskConfig;
        const buildConfig = projectConfig.tasks?.build ?? {};
        const extendedBuildConfig = { ...baseBuildConfig, ...buildConfig };
        if (!projectConfig.tasks) {
            projectConfig.tasks = {
                build: extendedBuildConfig
            };
        } else {
            projectConfig.tasks.build = extendedBuildConfig;
        }
    }
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
