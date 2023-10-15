/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { CommandOptions } from '../config-models/index.mjs';
import { BuildTaskConfig, CustomTaskConfig, LibConfig } from '../config-models/internals/index.mjs';
import { findUp, isInFolder, isSamePath, pathExists, resolvePath } from '../utils/index.mjs';

import { BuildTask } from './build-task.mjs';
import { CustomTask } from './custom-task.mjs';
import { InvalidCommandOptionError, InvalidConfigError } from './exceptions/index.mjs';
import { applyEnvOverrides } from './internals/apply-env-overrides.mjs';
import { applyProjectExtends } from './internals/apply-project-extends.mjs';
import { getParsedCommandOptions } from './internals/get-parsed-command-options.mjs';
import { ParsedCommandOptions } from './internals/parsed-command-options.mjs';
import { readLibConfigJsonFile } from './internals/read-lib-config-json-file.mjs';
import { validateBuildTask } from './internals/validate-build-task.mjs';
import { validateCustomTask } from './internals/validate-custom-task.mjs';
import { validateLibConfig } from './internals/validate-lib-config.mjs';
import { TaskFilter } from './task-filter.mjs';
import { TaskInfo } from './task-info.mjs';

const libConfigValidationStatusCache = new Map<string, true>();

async function toBuildTask(buildTaskConfig: BuildTaskConfig, taskInfo: Omit<TaskInfo, 'taskName'>): Promise<BuildTask> {
    const { workspaceRoot, projectRoot, projectName, configPath } = taskInfo;

    const outDir = buildTaskConfig.outDir
        ? resolvePath(projectRoot, buildTaskConfig.outDir)
        : resolvePath(projectRoot, 'dist');

    buildTaskConfig.outDir = outDir;

    await validateBuildTask(buildTaskConfig, {
        workspaceRoot,
        projectRoot,
        projectName,
        configPath
    });

    const buildTask: BuildTask = {
        ...buildTaskConfig,
        outDir,
        taskCategory: 'build',
        taskName: 'build',
        workspaceRoot,
        projectRoot,
        projectName,
        configPath
    };

    if (typeof (buildTask as BuildTaskConfig).skip !== 'undefined') {
        delete (buildTask as BuildTaskConfig).skip;
    }

    if (typeof (buildTask as BuildTaskConfig).envOverrides !== 'undefined') {
        delete (buildTask as BuildTaskConfig).envOverrides;
    }

    return buildTask;
}
async function toCustomTask(customTaskConfig: CustomTaskConfig, taskInfo: TaskInfo): Promise<CustomTask> {
    const { workspaceRoot, projectRoot, projectName, taskName, configPath } = taskInfo;

    await validateCustomTask(customTaskConfig, {
        workspaceRoot,
        projectRoot,
        projectName,
        taskName,
        configPath
    });

    const customTask: CustomTask = {
        ...customTaskConfig,

        taskCategory: 'custom',
        taskName,
        workspaceRoot,
        projectRoot,
        projectName,
        configPath
    };

    if (typeof (customTask as CustomTaskConfig).skip !== 'undefined') {
        delete (customTask as CustomTaskConfig).skip;
    }

    if (typeof (customTask as CustomTaskConfig).envOverrides !== 'undefined') {
        delete (customTask as CustomTaskConfig).envOverrides;
    }

    return customTask;
}

function getBuildTaskConfigFromCmdOptions(cmdOptions: Readonly<ParsedCommandOptions>): BuildTaskConfig | null {
    const buildTask: BuildTaskConfig = {};
    let merged = false;

    // outDir
    if (cmdOptions.outDir) {
        buildTask.outDir = cmdOptions.outDir;
    }

    // clean
    if (cmdOptions.clean != null) {
        if (buildTask.clean == null || typeof buildTask.clean === 'boolean') {
            buildTask.clean = cmdOptions.clean;
        } else {
            if (buildTask.clean.beforeBuild) {
                buildTask.clean.beforeBuild.cleanOutDir = cmdOptions.clean;
            } else {
                buildTask.clean.beforeBuild = {
                    cleanOutDir: cmdOptions.clean
                };
            }
        }

        merged = true;
    }

    // copy
    if (cmdOptions.copy.length) {
        buildTask.copy = [...cmdOptions.copy];

        merged = true;
    }

    // styles
    if (cmdOptions.style.length) {
        if (!buildTask.style) {
            buildTask.style = [...cmdOptions.style];
        } else {
            if (Array.isArray(buildTask.style)) {
                buildTask.style = [...cmdOptions.style];
            } else {
                buildTask.style.compilations = cmdOptions.style.map((entry) => {
                    return {
                        entry
                    };
                });
            }
        }

        merged = true;
    }

    // scripts
    if (cmdOptions.script.length) {
        if (!buildTask.script) {
            buildTask.script = [...cmdOptions.script];
        } else {
            if (Array.isArray(buildTask.script)) {
                buildTask.script = [...cmdOptions.script];
            } else {
                buildTask.script.compilations = cmdOptions.script.map((entry) => {
                    return {
                        entry
                    };
                });
            }
        }

        merged = true;
    }

    // packageVersion
    if (cmdOptions.packageVersion) {
        if (!buildTask.packageJson || typeof buildTask.packageJson === 'boolean') {
            buildTask.packageJson = {
                packageVersion: cmdOptions.packageVersion
            };
        } else {
            buildTask.packageJson.packageVersion = cmdOptions.packageVersion;
        }

        merged = true;
    }

    return merged ? buildTask : null;
}

async function getTasksFromLibConfig(
    libConfig: Readonly<LibConfig>,
    options: Readonly<{
        workspaceRoot: string;
        configPath?: string | null;
        env?: string | null;
        filter?: Readonly<TaskFilter> | null;
    }>
): Promise<(BuildTask | CustomTask)[]> {
    const { workspaceRoot, configPath, env, filter } = options;

    const validateCacheKey =
        configPath && configPath.trim().length > 0
            ? path.isAbsolute(configPath)
                ? path.resolve(configPath)
                : path.resolve(process.cwd(), configPath)
            : null;

    const validated = validateCacheKey ? libConfigValidationStatusCache.get(validateCacheKey) : false;

    if (!validated) {
        validateLibConfig(libConfig, configPath);

        if (validateCacheKey) {
            libConfigValidationStatusCache.set(validateCacheKey, true);
        }
    }

    if (!libConfig.projects) {
        throw new InvalidConfigError(
            `No project is defined. Specify project options in 'projects' list.`,
            configPath,
            'projects'
        );
    }

    const tasks: (BuildTask | CustomTask)[] = [];

    const projects = Object.entries(libConfig.projects).map((pair) => {
        return {
            ...pair[1],
            name: pair[0]
        };
    });

    for (const project of projects) {
        applyProjectExtends(project, projects, configPath);

        const projectRoot = project.root ? resolvePath(workspaceRoot, project.root) : workspaceRoot;

        if (!isSamePath(workspaceRoot, projectRoot) && !isInFolder(workspaceRoot, projectRoot)) {
            throw new InvalidConfigError(
                `The project 'root' must not be the parent of workspace root.`,
                configPath,
                `projects/${project.name}/root`
            );
        }

        if (filter?.projectNames && filter.projectNames.length > 0 && !filter.projectNames.includes(project.name)) {
            continue;
        }

        if (!project.tasks) {
            continue;
        }

        for (const [currentTaskName, task] of Object.entries(project.tasks)) {
            if (
                task == null ||
                !Object.keys(task).length ||
                (filter?.taskNames && filter.taskNames.length > 0 && !filter.taskNames.includes(currentTaskName))
            ) {
                continue;
            }

            if (env) {
                applyEnvOverrides(task, [env]);
            }

            if (task.skip) {
                continue;
            }

            if (currentTaskName === 'build') {
                const buildTaskConfig = task as BuildTaskConfig;

                const buildTask = await toBuildTask(buildTaskConfig, {
                    workspaceRoot,
                    projectRoot,
                    projectName: project.name,
                    configPath
                });

                tasks.push(buildTask);
            } else {
                const customTaskConfig = task as CustomTaskConfig;
                const customTask = await toCustomTask(customTaskConfig, {
                    workspaceRoot,
                    projectRoot,
                    projectName: project.name,
                    taskName: currentTaskName,
                    configPath
                });

                tasks.push(customTask);
            }
        }
    }

    return tasks;
}

export async function getTasksFromCommandOptions(
    cmdOptions: Readonly<CommandOptions & { task: string }>
): Promise<(BuildTask | CustomTask)[]> {
    const parsedCmdOptions = await getParsedCommandOptions(cmdOptions);

    let configPath = parsedCmdOptions.configPath;
    if (!configPath) {
        let tempConfigPath: string | null = null;

        if (cmdOptions.workspace) {
            const testPath = path.resolve(parsedCmdOptions.workspaceRoot, 'libconfig.json');
            if (await pathExists(testPath, true)) {
                tempConfigPath = testPath;
            }
        } else {
            tempConfigPath = await findUp('libconfig.json', process.cwd(), path.parse(process.cwd()).root, true);
        }

        if (tempConfigPath) {
            const configStats = await fs.stat(tempConfigPath);
            if (configStats.isFile()) {
                configPath = tempConfigPath;
            }
        }
    }

    const workspaceRoot = configPath ? path.dirname(configPath) : parsedCmdOptions.workspaceRoot;

    if (configPath) {
        const libConfig = await readLibConfigJsonFile(configPath, false);

        const configFilter: TaskFilter = {
            taskNames: [cmdOptions.task],
            projectNames: parsedCmdOptions.projects
        };

        const tasks = await getTasksFromLibConfig(libConfig, {
            workspaceRoot,
            configPath,
            env: parsedCmdOptions.env,
            filter: configFilter
        });

        return tasks;
    } else {
        if (cmdOptions.task === 'build') {
            const buildTaskConfig = getBuildTaskConfigFromCmdOptions(parsedCmdOptions);
            if (buildTaskConfig != null) {
                const buildTask = await toBuildTask(buildTaskConfig, {
                    workspaceRoot,
                    projectRoot: workspaceRoot,
                    configPath
                });

                return [buildTask];
            } else {
                throw new InvalidCommandOptionError(
                    null,
                    null,
                    'More parameters are required. Specify libconfig.json file path or more build parameters in command line to run build task.'
                );
            }
        } else {
            throw new InvalidCommandOptionError(null, null, 'Specify libconfig.json file path to run custom task.');
        }
    }
}

export async function getTasksFromLibConfigFile(
    configPath: string,
    filter?: Readonly<TaskFilter> | null,
    env?: string
): Promise<(BuildTask | CustomTask)[]> {
    const workspaceRoot = path.dirname(configPath);

    const libConfig = await readLibConfigJsonFile(configPath, false);

    const tasks = await getTasksFromLibConfig(libConfig, {
        workspaceRoot,
        configPath,
        env,
        filter
    });

    return tasks;
}
