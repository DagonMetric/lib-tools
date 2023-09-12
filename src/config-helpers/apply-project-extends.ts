import { Project, Task } from '../config-models/index.js';
import { InvalidConfigError } from '../exceptions/index.js';

function applyProjectExtendsInternal(
    projectName: string,
    projectConfig: Project,
    projectCollection: Record<string, Project>,
    prevExtends: string[],
    configPath: string | null
): void {
    const projectNameToExtend = projectConfig.extends?.trim();
    if (!projectNameToExtend) {
        return;
    }

    const configLocation = `projects/${projectName}/extends`;

    if (prevExtends.includes(projectNameToExtend)) {
        throw new InvalidConfigError('Cross referencing extend founds.', configPath, configLocation);
    }

    const baseProject = projectCollection[projectNameToExtend];
    if (!baseProject) {
        throw new InvalidConfigError('No base project to extend.', configPath, configLocation);
    }

    prevExtends.push(projectNameToExtend);

    if (baseProject.extends) {
        applyProjectExtendsInternal(projectName, baseProject, projectCollection, prevExtends, configPath);
    }

    for (const [key, data] of Object.entries(baseProject)) {
        if (key === 'extends') {
            continue;
        } else if (key === 'tasks') {
            if (!data || typeof data !== 'object') {
                continue;
            }

            for (const [taskName, task] of Object.entries(data as Record<string, Task>)) {
                if (!task) {
                    continue;
                }

                const baseTask = JSON.parse(JSON.stringify(task)) as Task;
                projectConfig.tasks = projectConfig.tasks ?? {};
                const projectConfigTasks = projectConfig.tasks as Record<string, Task>;
                const projectConfigTask = projectConfigTasks[taskName] || {};
                projectConfigTasks[taskName] = { ...baseTask, ...projectConfigTask };
            }

            continue;
        } else {
            if (typeof data === 'object') {
                (projectConfig as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(data)) as unknown;
            } else {
                (projectConfig as Record<string, unknown>)[key] = data as unknown;
            }
        }
    }
}

export function applyProjectExtends(
    projectName: string,
    projectConfig: Project,
    projectCollection: Record<string, Project>,
    configPath: string | null
): void {
    if (!projectConfig.extends?.trim().length) {
        return;
    }

    const prevExtends = [projectName];
    applyProjectExtendsInternal(projectName, projectConfig, projectCollection, prevExtends, configPath);
}
