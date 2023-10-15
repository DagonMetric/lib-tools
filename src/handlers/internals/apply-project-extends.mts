/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import { ProjectConfig } from '../../config-models/internals/index.mjs';

import { InvalidConfigError } from '../exceptions/index.mjs';

function applyProjectExtendsInternal(
    currentProject: ProjectConfig & { name: string },
    projects: readonly (ProjectConfig & { name: string })[],
    extendedNames: string[],
    configPath: string | null | undefined
): void {
    const projectNameToExtend = currentProject.extends?.trim();
    if (!projectNameToExtend) {
        return;
    }

    const extendsConfigLocation = `projects/${currentProject.name}/extends`;

    // Validations
    //
    if (projectNameToExtend === currentProject.name) {
        throw new InvalidConfigError(`Can't extend self.`, configPath, extendsConfigLocation);
    }

    if (extendedNames.includes(projectNameToExtend)) {
        throw new InvalidConfigError('Cross referencing extend occours.', configPath, extendsConfigLocation);
    }

    const baseProject = projects.find((p) => p.name === projectNameToExtend);
    if (!baseProject) {
        throw new InvalidConfigError('No base project to extend.', configPath, extendsConfigLocation);
    }

    extendedNames.push(projectNameToExtend);

    if (baseProject.extends) {
        applyProjectExtendsInternal(baseProject, projects, extendedNames, configPath);
    }

    for (const projectKey of Object.keys(baseProject)) {
        const projectTypedKey = projectKey as keyof (ProjectConfig & { name: string });

        if (projectTypedKey === 'extends' || projectTypedKey === 'name') {
            continue;
        } else if (projectTypedKey === 'tasks') {
            const baseProjectTasks = baseProject[projectTypedKey];

            if (!baseProjectTasks) {
                continue;
            }

            if (typeof baseProjectTasks !== 'object') {
                throw new InvalidConfigError(
                    `Invalid 'tasks' value.`,
                    configPath,
                    `projects/${baseProject.name}/tasks`
                );
            }

            currentProject.tasks = currentProject.tasks ?? {};

            for (const taskName of Object.keys(baseProjectTasks)) {
                const baseProjectTask = baseProjectTasks[taskName];

                if (!baseProjectTask) {
                    continue;
                }

                if (typeof baseProjectTask !== 'object') {
                    throw new InvalidConfigError(
                        `Invalid 'task' value.`,
                        configPath,
                        `projects/${baseProject.name}/tasks/${taskName}`
                    );
                }

                const baseProjectTaskCloned = JSON.parse(JSON.stringify(baseProjectTask)) as Record<string, unknown>;

                const currentProjectTask = currentProject.tasks[taskName] ?? {};
                if (currentProjectTask.priority == null || currentProjectTask.priority === 0) {
                    if (baseProjectTask.priority != null && typeof baseProjectTask.priority === 'number') {
                        const baseTaskPriority = baseProjectTask.priority > 0 ? baseProjectTask.priority : 0;
                        currentProjectTask.priority = baseTaskPriority + 1;
                    } else {
                        currentProjectTask.priority = 1;
                    }
                }

                currentProject.tasks[taskName] = { ...baseProjectTaskCloned, ...currentProjectTask };
            }

            continue;
        } else {
            currentProject[projectTypedKey] = baseProject[projectTypedKey];
        }
    }
}

export function applyProjectExtends(
    currentProject: ProjectConfig & { name: string },
    projects: readonly (ProjectConfig & { name: string })[],
    configPath: string | null | undefined
): void {
    if (!currentProject.extends?.trim().length) {
        return;
    }

    const extendedNames = [currentProject.name];
    applyProjectExtendsInternal(currentProject, projects, extendedNames, configPath);
}
