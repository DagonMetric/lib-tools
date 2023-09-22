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
import { InvalidCommandOptionError, InvalidConfigError } from '../exceptions/index.js';
import { findUp, isInFolder, isSamePaths, pathExists, readJsonWithComments, resolvePath } from '../utils/index.js';

import { applyEnvOverrides } from './apply-env-overrides.js';
import { applyProjectExtends } from './apply-project-extends.js';
import { getParsedBuildTask } from './get-parsed-build-task.js';
import { getParsedCommandOptions } from './get-parsed-command-options.js';
import { readLibConfigJsonFile } from './read-lib-config-json-file.js';

const versionPlaceholderRegExp = /^0\.0\.0|0\.0\.0-PLACEHOLDER|\[VERSION\]|\[PLACEHOLDER\]$/i;
const semverionPrefixRegExp = /^((0|[1-9]\d{0,9})\.){2,2}(0|[1-9]\d{0,9})/;
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

async function getPackageJsonInfo(
    workspaceInfo: WorkspaceInfo,
    packageVersionToSet: string | null | undefined
): Promise<PackageJsonInfo | null> {
    const { projectRoot, workspaceRoot } = workspaceInfo;
    const configLocationPrefix = `projects/${workspaceInfo.projectName ?? '0'}/build`;

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
    let packageScope: string | null = null;

    if (slashIndex > -1 && packageName.startsWith('@')) {
        packageScope = packageName.substring(0, slashIndex);
    }

    let rootPackageJson: { [key: string]: unknown; version?: string } | null = null;
    let rootPackageJsonPath: string | null = null;
    if (!isSamePaths(path.dirname(packageJsonPath), workspaceRoot) && isInFolder(workspaceRoot, packageJsonPath)) {
        rootPackageJsonPath = await findUp('package.json', null, workspaceRoot);
        rootPackageJson = rootPackageJsonPath ? await readPackageJsonFile(rootPackageJsonPath) : null;
    }

    let newPackageVersion: string | null = null;
    if (packageVersionToSet) {
        if (packageVersionToSet === 'root') {
            if (rootPackageJson?.version == null || !semverionPrefixRegExp.test(rootPackageJson.version)) {
                const errMsg = 'Could not find valid root package.json version.';
                if (!workspaceInfo.projectName) {
                    throw new InvalidCommandOptionError('packageVersion', packageVersionToSet, errMsg);
                } else {
                    throw new InvalidConfigError(
                        errMsg,
                        workspaceInfo.configPath,
                        `${configLocationPrefix}/packageJson/packageVersion`
                    );
                }
            }

            newPackageVersion = rootPackageJson.version;
        } else {
            if (
                versionPlaceholderRegExp.test(packageVersionToSet) ||
                !semverionPrefixRegExp.test(packageVersionToSet)
            ) {
                const errMsg = 'The packageVersion is not valid semver.';
                if (!workspaceInfo.projectName) {
                    throw new InvalidCommandOptionError('packageVersion', packageVersionToSet, errMsg);
                } else {
                    throw new InvalidConfigError(
                        errMsg,
                        workspaceInfo.configPath,
                        `${configLocationPrefix}/packageJson/packageVersion`
                    );
                }
            }

            newPackageVersion = packageVersionToSet;
        }
    }

    return {
        packageJsonPath,
        packageJson,
        packageName,
        packageScope,
        rootPackageJsonPath,
        rootPackageJson,
        newPackageVersion
    };
}

function mergeBuildTaskWithCmdOptions(buildTask: BuildTask, cmdOptions: ParsedCommandOptions): boolean {
    let merged = false;

    // outDir
    if (cmdOptions.outDir && cmdOptions._outDir) {
        buildTask.outDir = cmdOptions.outDir;
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
        buildTask.copy = [...cmdOptions._copyEntries];

        merged = true;
    }

    // styles
    if (cmdOptions._styleEntries?.length) {
        if (!buildTask.style) {
            buildTask.style = [...cmdOptions._styleEntries];
        } else {
            if (Array.isArray(buildTask.style)) {
                buildTask.style = [...cmdOptions._styleEntries];
            } else {
                buildTask.style.bundles = cmdOptions._styleEntries.map((entry) => {
                    return {
                        entry
                    };
                });
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
                buildTask.script = [...cmdOptions._scriptEntries];
            } else {
                buildTask.script.compilations = cmdOptions._scriptEntries.map((entry) => {
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

    return merged;
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

            if (!project.tasks) {
                continue;
            }

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot,
                projectName,
                configPath,
                nodeModulePath
            };

            for (const [currentTaskName, task] of Object.entries(project.tasks)) {
                if (task == null || !Object.keys(task).length || taskName !== currentTaskName) {
                    continue;
                }

                if (parsedCmdOptions.env != null) {
                    applyEnvOverrides(task, [parsedCmdOptions.env]);
                }

                if (task.skip) {
                    continue;
                }

                if (currentTaskName === 'build') {
                    const buildTask = task as BuildTask;
                    mergeBuildTaskWithCmdOptions(buildTask, parsedCmdOptions);
                    const newPackageVersion =
                        buildTask.packageJson &&
                        typeof buildTask.packageJson === 'object' &&
                        buildTask.packageJson.packageVersion
                            ? buildTask.packageJson.packageVersion
                            : null;
                    const packageJsonInfo = await getPackageJsonInfo(workspaceInfo, newPackageVersion);
                    const parsedBuildTask = await getParsedBuildTask(buildTask, workspaceInfo, packageJsonInfo);

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

    if (taskName === 'build' && !tasks.filter((t) => t._taskName === 'build').length) {
        const newBuildTask: BuildTask = {};
        const merged = mergeBuildTaskWithCmdOptions(newBuildTask, parsedCmdOptions);
        if (merged) {
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: null,
                configPath,
                nodeModulePath
            };

            const packageJsonInfo = await getPackageJsonInfo(workspaceInfo, parsedCmdOptions.packageVersion);
            const parsedBuildTask = await getParsedBuildTask(newBuildTask, workspaceInfo, packageJsonInfo);

            tasks.push(parsedBuildTask);
        }
    }

    return tasks;
}
