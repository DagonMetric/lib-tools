import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BuildTask, CommandOptions, CustomTask } from '../config-models/index.js';
import {
    PackageJsonInfo,
    ParsedBuildTaskConfig,
    ParsedCommandOptions,
    ParsedCustomTaskConfig,
    WorkspaceInfo
} from '../config-models/parsed/index.js';
import { InvalidConfigError } from '../exceptions/index.js';
import { findUp, isInFolder, isSamePaths, pathExists, readJsonWithComments, resolvePath } from '../utils/index.js';

import { applyEnvOverrides } from './apply-env-overrides.js';
import { applyProjectExtends } from './apply-project-extends.js';
import { getParsedCommandOptions } from './get-parsed-command-options.js';
import { readLibConfigJsonFile } from './read-lib-config-json-file.js';

const packageJsonCache = new Map<string, Record<string, unknown>>();
async function readPackageJsonFile(packageJsonPath: string): Promise<Record<string, unknown>> {
    const cachedPackageJson = packageJsonCache.get(packageJsonPath);
    if (cachedPackageJson) {
        return cachedPackageJson;
    }

    const packageJson = (await readJsonWithComments(packageJsonPath)) as Record<string, unknown>;
    packageJsonCache.set(packageJsonPath, packageJson);

    return packageJson;
}

async function getPackageJsonInfo(workspaceInfo: {
    projectRoot: string;
    workspaceRoot: string;
}): Promise<PackageJsonInfo | null> {
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

    let isNestedPackage = false;
    if (packageName.split('/').length > 2 || (!packageName.startsWith('@') && packageName.split('/').length >= 2)) {
        isNestedPackage = true;
    }

    let rootPackageVersion: string | null = null;
    if (!isSamePaths(path.dirname(packageJsonPath), workspaceRoot) && isInFolder(workspaceRoot, packageJsonPath)) {
        const rootPackageJsonPath = await findUp('package.json', null, workspaceRoot);
        const rootPackageJson = rootPackageJsonPath ? await readPackageJsonFile(rootPackageJsonPath) : null;
        if (
            typeof rootPackageJson?.version === 'string' &&
            rootPackageJson.version !== '0.0.0' &&
            rootPackageJson.version !== '[PLACEHOLDER]' &&
            !/0\.0\.0-PLACEHOLDER/i.test(rootPackageJson.version)
        ) {
            rootPackageVersion = rootPackageJson.version;
        }
    }

    return {
        packageJsonPath,
        packageJson,
        packageName,
        packageNameWithoutScope,
        packageScope,
        isNestedPackage,
        rootPackageVersion
    };
}

function getBuildTaskFromCmdOptions(cmdOptions: ParsedCommandOptions, buildTask: BuildTask): boolean {
    let merged = false;

    // outDir
    if (cmdOptions.outDir) {
        // outDir assign is already done in toParsedBuildTask
        merged = true;
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
        } else {
            buildTask.packageJson.packageVersion = cmdOptions.packageVersion;
        }

        merged = true;
    }

    return merged;
}

export function validateOutDir(outDir: string, workspaceInfo: WorkspaceInfo): void {
    const workspaceRoot = workspaceInfo.workspaceRoot;
    const projectRoot = workspaceInfo.projectRoot;
    const projectName = workspaceInfo.projectName ?? '0';
    const configLocationPrefix = `projects/${projectName}/tasks/build`;
    const configPath = workspaceInfo.configPath;

    if (!outDir?.trim().length) {
        throw new InvalidConfigError(`The 'outDir' must not be empty.`, configPath, `${configLocationPrefix}/outDir`);
    }

    if (outDir.trim() === '/' || outDir.trim() === '\\' || isSamePaths(outDir, path.parse(outDir).root)) {
        throw new InvalidConfigError(
            `The 'outDir' must not be system root directory.`,
            configPath,
            `${configLocationPrefix}/outDir`
        );
    }

    if (isInFolder(outDir, workspaceRoot) || isInFolder(outDir, process.cwd())) {
        throw new InvalidConfigError(
            `The 'outDir' must not be parent of worksapce root or current working directory.`,
            configPath,
            `${configLocationPrefix}/outDir`
        );
    }

    if (isInFolder(outDir, projectRoot)) {
        throw new InvalidConfigError(
            `The 'outDir' must not be parent of project root directory.`,
            configPath,
            `${configLocationPrefix}/outDir`
        );
    }
}

export function toParsedBuildTask(
    buildTask: BuildTask,
    workspaceInfo: WorkspaceInfo,
    packageJsonInfo: PackageJsonInfo | null,
    cmdOptions: { outDir?: string }
): ParsedBuildTaskConfig {
    const projectRoot = workspaceInfo.projectRoot;

    let outDir = path.resolve(projectRoot, 'dist');
    if (cmdOptions.outDir) {
        buildTask.outDir = cmdOptions.outDir;
        outDir = resolvePath(projectRoot, cmdOptions.outDir);
    } else if (buildTask.outDir?.trim().length) {
        outDir = resolvePath(projectRoot, buildTask.outDir);
    }

    const parsedBuildTask: ParsedBuildTaskConfig = {
        _taskName: 'build',
        _workspaceInfo: workspaceInfo,
        _packageJsonInfo: packageJsonInfo,
        _outDir: outDir,
        ...buildTask
    };

    validateOutDir(outDir, workspaceInfo);

    return parsedBuildTask;
}

export async function getTasks(
    cmdOptions: CommandOptions,
    taskName: string
): Promise<(ParsedBuildTaskConfig | ParsedCustomTaskConfig)[]> {
    const parsedCmdOptions = await getParsedCommandOptions(cmdOptions);

    let configPath = parsedCmdOptions._configPath;
    if (!configPath) {
        let tempConfigPath: string | null = null;

        if (parsedCmdOptions.workspace) {
            const testPath = path.resolve(parsedCmdOptions._workspaceRoot, 'libconfig.json');
            if (await pathExists(testPath)) {
                tempConfigPath = testPath;
            }
        } else {
            tempConfigPath = await findUp('libconfig.json', process.cwd(), path.parse(process.cwd()).root);
        }

        if (tempConfigPath) {
            const configStats = await fs.stat(tempConfigPath);
            if (configStats.isFile()) {
                configPath = tempConfigPath;
            }
        }
    }

    const workspaceRoot = configPath ? path.dirname(configPath) : parsedCmdOptions._workspaceRoot;
    const nodeModulePath = await findUp('node_modules', workspaceRoot, path.parse(workspaceRoot).root);

    const tasks: (ParsedBuildTaskConfig | ParsedCustomTaskConfig)[] = [];

    if (configPath) {
        const libConfig = await readLibConfigJsonFile(configPath);
        libConfig.projects = libConfig.projects || {};

        for (const [projectName, project] of Object.entries(libConfig.projects)) {
            applyProjectExtends(projectName, project, libConfig.projects, configPath);

            const projectRoot = project.root ? resolvePath(workspaceRoot, project.root) : workspaceRoot;

            if (!isSamePaths(workspaceRoot, projectRoot) && !isInFolder(workspaceRoot, projectRoot)) {
                throw new InvalidConfigError(
                    `The project 'root' must not be parent of workspace root.`,
                    configPath,
                    `projects/${projectName}/root`
                );
            }

            if (parsedCmdOptions._projects.length && !parsedCmdOptions._projects.includes(projectName)) {
                continue;
            }

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot,
                projectName,
                configPath,
                nodeModulePath
            };

            if (!project.tasks) {
                continue;
            }

            for (const [currentTaskName, task] of Object.entries(project.tasks)) {
                if (task == null || !Object.keys(task).length || taskName !== currentTaskName) {
                    continue;
                }

                applyEnvOverrides(task, parsedCmdOptions._env);

                if (task.skip) {
                    continue;
                }

                if (currentTaskName === 'build') {
                    const buildTask = task as BuildTask;

                    const packageJsonInfo = await getPackageJsonInfo(workspaceInfo);
                    const parsedBuildTask = toParsedBuildTask(
                        buildTask,
                        workspaceInfo,
                        packageJsonInfo,
                        parsedCmdOptions._outDir && parsedCmdOptions.outDir ? { outDir: parsedCmdOptions.outDir } : {}
                    );

                    tasks.push(parsedBuildTask);
                } else {
                    const customTask = task as CustomTask;
                    const parsedTask: ParsedCustomTaskConfig = {
                        ...customTask,
                        _taskName: currentTaskName,
                        _workspaceInfo: workspaceInfo
                    };
                    tasks.push(parsedTask);
                }
            }
        }
    }

    if (taskName === 'build') {
        const foundBuildTask = tasks.find((t) => t._taskName === 'build' && !t.skip);
        const buildTask = foundBuildTask ?? ({} as BuildTask);

        const hasBuildTask = getBuildTaskFromCmdOptions(parsedCmdOptions, buildTask);

        if (hasBuildTask && !foundBuildTask) {
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: null,
                configPath,
                nodeModulePath
            };

            const packageJsonInfo = await getPackageJsonInfo(workspaceInfo);

            const parsedBuildTask = toParsedBuildTask(
                buildTask,
                workspaceInfo,
                packageJsonInfo,
                parsedCmdOptions._outDir && parsedCmdOptions.outDir ? { outDir: parsedCmdOptions.outDir } : {}
            );

            tasks.push(parsedBuildTask);
        }
    }

    return tasks;
}
