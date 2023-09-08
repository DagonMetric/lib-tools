import { InvalidConfigError } from '../exceptions/index.js';
import { Project, Task } from '../models/index.js';

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

    if (baseProject.tasks) {
        for (const [key, task] of Object.entries(baseProject.tasks)) {
            if (!task) {
                continue;
            }

            const baseTask = JSON.parse(JSON.stringify(task)) as Task;
            projectConfig.tasks = projectConfig.tasks ?? {};
            const currentTasks = projectConfig.tasks as Record<string, Task>;
            const currentTask = currentTasks[key] || {};
            currentTasks[key] = { ...baseTask, ...currentTask };
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
