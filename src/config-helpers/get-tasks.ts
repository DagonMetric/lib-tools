import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { BuildTask, CommandOptions } from '../models/index.js';
import {
    PackageJsonInfo,
    ParsedBuildTask,
    ParsedCommandOptions,
    ParsedTask,
    WorkspaceInfo
} from '../models/parsed/index.js';
import { findUp, isInFolder, isSamePaths } from '../utils/index.js';

import { applyEnvOverrides } from './apply-env-overrides.js';
import { applyProjectExtends } from './apply-project-extends.js';
import { getParsedCommandOptions } from './get-parsed-command-options.js';
import { readLibConfigJsonFile } from './read-lib-config-json-file.js';
import { toParsedBuildTask } from './to-parsed-build-task.js';

const packageJsonCache = new Map<string, Record<string, unknown>>();
async function readPackageJsonFile(packageJsonPath: string): Promise<Record<string, unknown>> {
    const cachedPackageJson = packageJsonCache.get(packageJsonPath);
    if (cachedPackageJson) {
        return cachedPackageJson;
    }

    const content = await fs.readFile(packageJsonPath, { encoding: 'utf8' });
    const packageJson = JSON.parse(content) as Record<string, unknown>;
    packageJsonCache.set(packageJsonPath, packageJson);

    return packageJson;
}

async function getPackageJsonInfo(
    workspaceInfo: { projectRoot: string; workspaceRoot: string },
    packageVersionToOverride: string | null | undefined
): Promise<PackageJsonInfo | null> {
    const { projectRoot, workspaceRoot } = workspaceInfo;

    const packageJsonPath = await findUp('package.json', projectRoot, workspaceRoot);
    if (!packageJsonPath) {
        return null;
    }

    const packageJson = await readPackageJsonFile(packageJsonPath);
    const packageName = packageJson.name as string;

    if (!packageName) {
        return null;
    }

    if (packageJson.private) {
        return null;
    }

    const slashIndex = packageName.indexOf('/');
    let packageNameWithoutScope = packageName;
    let packageScope: string | null = null;

    if (slashIndex > -1 && packageName.startsWith('@')) {
        packageScope = packageName.substring(0, slashIndex);
        packageNameWithoutScope = packageName.substring(slashIndex + 1);
    }

    let rootPackageJsonPath: string | null = null;
    let rootPackageJson: Record<string, unknown> | null = null;

    if (!isSamePaths(path.dirname(packageJsonPath), workspaceRoot) && isInFolder(workspaceRoot, packageJsonPath)) {
        rootPackageJsonPath = await findUp('package.json', null, workspaceRoot);
        rootPackageJson = rootPackageJsonPath ? await readPackageJsonFile(rootPackageJsonPath) : null;
    }

    let packageVersion: string | null = null;
    if (packageVersionToOverride) {
        packageVersion = packageVersionToOverride;
    } else {
        if (
            rootPackageJson?.version &&
            (!packageJson.version ||
                packageJson.version === '0.0.0' ||
                packageJson.version === '[PLACEHOLDER]' ||
                (packageJson.version && /0\.0\.0-PLACEHOLDER/i.test(packageJson.version as string)))
        ) {
            packageVersion = rootPackageJson.version as string;
        } else if (packageJson?.version) {
            packageVersion = packageJson.version as string;
        }
    }

    let isNestedPackage = false;
    if (packageName.split('/').length > 2 || (!packageName.startsWith('@') && packageName.split('/').length >= 2)) {
        isNestedPackage = true;
    }

    return {
        packageJsonPath,
        packageJson,
        packageName,
        packageNameWithoutScope,
        packageScope,
        packageVersion,
        isNestedPackage,
        rootPackageJsonPath,
        rootPackageJson
    };
}

function mergeBuildTaskFromCommandOptions(cmdOptions: ParsedCommandOptions, buildTask: BuildTask): boolean {
    if (
        !cmdOptions.clean &&
        !cmdOptions._copyEntries?.length &&
        !cmdOptions._styleEntries?.length &&
        !cmdOptions._scriptEntries?.length
    ) {
        return false;
    }

    let merged = false;

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
    if (cmdOptions._copyEntries?.length) {
        if (!buildTask.copy) {
            buildTask.copy = [...cmdOptions._copyEntries];
        } else {
            buildTask.copy = [...buildTask.copy, ...cmdOptions._copyEntries];
        }

        merged = true;
    }

    // styles
    if (cmdOptions._styleEntries?.length) {
        if (!buildTask.style) {
            buildTask.style = [...cmdOptions._styleEntries];
        } else {
            if (Array.isArray(buildTask.style)) {
                buildTask.style = [...buildTask.style, ...cmdOptions._styleEntries];
            } else {
                const bundleEntries = buildTask.style.bundles ?? [];
                cmdOptions._styleEntries.forEach((entry) => bundleEntries.push({ entry }));
                buildTask.style.bundles = bundleEntries;
            }
        }

        merged = true;
    }

    // scripts
    if (cmdOptions._scriptEntries?.length) {
        if (!buildTask.script) {
            buildTask.script = [...cmdOptions._scriptEntries];
        } else {
            if (Array.isArray(buildTask.script)) {
                buildTask.script = [...buildTask.script, ...cmdOptions._scriptEntries];
            } else {
                const bundleEntries = buildTask.script.bundles ?? [];
                cmdOptions._scriptEntries.forEach((entry) => bundleEntries.push({ entry }));
                buildTask.script.bundles = bundleEntries;
            }
        }

        merged = true;
    }

    // package.json
    if (cmdOptions.packageVersion) {
        if (!buildTask.packageJson || typeof buildTask.packageJson === 'boolean') {
            buildTask.packageJson = {
                packageVersion: cmdOptions.packageVersion
            };
            merged = true;
        } else if (!buildTask.packageJson.packageVersion) {
            buildTask.packageJson.packageVersion = cmdOptions.packageVersion;
            merged = true;
        }
    }

    return merged;
}

export async function getTasks(cmdOptions: CommandOptions, forTask?: string): Promise<ParsedTask[]> {
    const parsedCmdOptions = await getParsedCommandOptions(cmdOptions);

    let configPath = parsedCmdOptions._configPath;
    if (!configPath) {
        const workingDir = parsedCmdOptions._workspaceRoot ?? process.cwd();
        configPath = await findUp('libconfig.json', workingDir, path.parse(workingDir).root);
    }

    const workspaceRoot = configPath
        ? path.dirname(configPath)
        : parsedCmdOptions._workspaceRoot
        ? parsedCmdOptions._workspaceRoot
        : process.cwd();

    const tasks: ParsedTask[] = [];

    if (configPath) {
        const libConfig = await readLibConfigJsonFile(configPath);
        libConfig.projects = libConfig.projects || {};

        for (const [projectName, project] of Object.entries(libConfig.projects)) {
            applyProjectExtends(projectName, project, libConfig.projects, configPath);

            const projectRoot = project.root
                ? path.isAbsolute(project.root)
                    ? path.resolve(project.root)
                    : path.resolve(workspaceRoot, project.root)
                : workspaceRoot;

            if (!isSamePaths(workspaceRoot, projectRoot) && !isInFolder(workspaceRoot, projectRoot)) {
                throw new InvalidConfigError(
                    `The project 'root' must not be parent of workspace root.`,
                    configPath,
                    `projects[${projectName}].root`
                );
            }

            if (parsedCmdOptions._projects.length && !parsedCmdOptions._projects.includes(projectName)) {
                continue;
            }

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot,
                projectName,
                configPath
            };

            if (!project.tasks) {
                continue;
            }

            for (const [taskName, task] of Object.entries(project.tasks)) {
                if (forTask && forTask !== taskName) {
                    continue;
                }

                if (task == null || !Object.keys(task).length) {
                    continue;
                }

                applyEnvOverrides(task, parsedCmdOptions._env);

                if (task.skip) {
                    continue;
                }

                if (taskName === 'build') {
                    const buildTask = task as BuildTask;

                    const packageVersion =
                        buildTask.packageJson &&
                        typeof buildTask.packageJson === 'object' &&
                        buildTask.packageJson.packageVersion
                            ? buildTask.packageJson.packageVersion
                            : parsedCmdOptions.packageVersion;

                    const packageJsonInfo = await getPackageJsonInfo(workspaceInfo, packageVersion);
                    const parsedBuildTask = toParsedBuildTask(
                        buildTask,
                        workspaceInfo,
                        packageJsonInfo,
                        parsedCmdOptions._outDir
                    );

                    tasks.push(parsedBuildTask);
                } else {
                    const parsedTask = {
                        ...task,
                        _taskName: taskName,
                        _workspaceInfo: workspaceInfo
                    };
                    tasks.push(parsedTask);
                }
            }
        }
    }

    if (!forTask || forTask === 'build') {
        const buildTasks = tasks.filter((t) => t._taskName === 'build');
        const firstBuildTask = buildTasks.length ? (buildTasks[0] as ParsedBuildTask) : {};
        const hasCommandOptionsBuildTask = mergeBuildTaskFromCommandOptions(parsedCmdOptions, firstBuildTask);

        if (hasCommandOptionsBuildTask && !buildTasks.length) {
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: null,
                configPath
            };

            const packageJsonInfo = await getPackageJsonInfo(workspaceInfo, parsedCmdOptions.packageVersion);

            const parsedBuildTask = toParsedBuildTask(
                firstBuildTask,
                workspaceInfo,
                packageJsonInfo,
                parsedCmdOptions._outDir
            );

            tasks.push(parsedBuildTask);
        }
    }

    return tasks;
}
