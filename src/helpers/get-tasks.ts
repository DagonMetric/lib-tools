import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidCommandOptionError, InvalidConfigError } from '../exceptions/index.js';
import { BuildTask, CommandOptions } from '../models/index.js';
import { findUp, isInFolder, isSamePaths, pathExists } from '../utils/index.js';

import { applyEnvOverrides } from './apply-env-overrides.js';
import { applyProjectExtends } from './apply-project-extends.js';
import { PackageJsonInfo, ParsedBuildTask, toParsedBuildTask } from './parsed-build-task.js';
import { ParsedCommandOptions, getParsedCommandOptions } from './parsed-command-options.js';
import { ParsedTask, WorkspaceInfo, toParsedTask } from './parsed-task.js';
import { readLibConfigJsonFile } from './read-lib-config-json-file.js';

async function validateCommandOptions(cmdOptions: ParsedCommandOptions): Promise<void> {
    if (cmdOptions._configPath && !(await pathExists(cmdOptions._configPath))) {
        throw new InvalidCommandOptionError(
            `The 'libconfig' file path doesn't exist. File path: ${cmdOptions._configPath}.`
        );
    }

    if (cmdOptions._outDir) {
        if (cmdOptions._outDir === path.parse(cmdOptions._outDir).root) {
            throw new InvalidCommandOptionError(`The 'outDir' must not be the same as system root directory.`);
        }

        if (
            isInFolder(cmdOptions._outDir, process.cwd()) ||
            (cmdOptions._workspaceRoot && isInFolder(cmdOptions._outDir, cmdOptions._workspaceRoot))
        ) {
            throw new InvalidCommandOptionError(
                `The 'outDir' must not be parent directory of current working directory.`
            );
        }
    }
}

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
        packageScope = packageName.substr(0, slashIndex);
        packageNameWithoutScope = packageName.substr(slashIndex + 1);
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
    }

    // copy
    if (cmdOptions._copyEntries?.length) {
        if (!buildTask.copy) {
            buildTask.copy = [...cmdOptions._copyEntries];
        } else {
            buildTask.copy = [...buildTask.copy, ...cmdOptions._copyEntries];
        }
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
    }

    return true;
}

export async function getTasks(cmdOptions: CommandOptions, forTask?: string): Promise<ParsedTask[]> {
    const parsedCmdOptions = getParsedCommandOptions(cmdOptions);
    await validateCommandOptions(parsedCmdOptions);

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

        for (const projectName of Object.keys(libConfig.projects)) {
            const project = libConfig.projects[projectName];

            applyProjectExtends(projectName, project, libConfig.projects);

            const projectRoot = project.root
                ? path.isAbsolute(project.root)
                    ? path.resolve(project.root)
                    : path.resolve(workspaceRoot, project.root)
                : workspaceRoot;

            if (!isSamePaths(workspaceRoot, projectRoot) && !isInFolder(workspaceRoot, projectRoot)) {
                throw new InvalidConfigError(
                    `The project 'root' must not be outside of current working directory.`,
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

                if (!task) {
                    continue;
                }

                if (!task.skip) {
                    applyEnvOverrides(task, parsedCmdOptions._env);
                }

                if (taskName === 'build') {
                    const buildTask = task as BuildTask;

                    let packageJsonInfo: PackageJsonInfo | null = null;

                    if (!buildTask.skip) {
                        packageJsonInfo = await getPackageJsonInfo(workspaceInfo, parsedCmdOptions.packageVersion);
                    }

                    const parsedBuildTask = toParsedBuildTask(
                        buildTask,
                        workspaceInfo,
                        packageJsonInfo,
                        parsedCmdOptions._outDir
                    );

                    tasks.push(parsedBuildTask);
                } else {
                    const parsedTask = toParsedTask(taskName, task, workspaceInfo);

                    tasks.push(parsedTask);
                }
            }
        }
    }

    if (forTask === 'build') {
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
