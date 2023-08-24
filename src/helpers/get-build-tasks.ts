import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidCommandOptionError, InvalidConfigError } from '../exceptions/index.js';
import { BuildTaskConfig, BuildCommandOptions } from '../models/index.js';
import { findUp, isInFolder, isSamePaths, pathExists } from '../utils/index.js';

import { applyEnvOverrides } from './apply-env-overrides.js';
import { applyProjectExtends } from './apply-project-extends.js';
import { getParsedBuildCommandOptions, ParsedBuildCommandOptions } from './parsed-build-command-options.js';
import {
    getParsedBuildTaskConfig,
    PackageJsonInfo,
    ParsedBuildTaskConfig,
    WorkspaceInfo
} from './parsed-build-task-config.js';
import { readLibConfigJsonFile } from './read-lib-config-json-file.js';

async function validateCommandOptions(cmdOptions: ParsedBuildCommandOptions): Promise<void> {
    if (cmdOptions._configPath && !(await pathExists(cmdOptions._configPath))) {
        throw new InvalidCommandOptionError(
            `The 'libconfig' file path doesn't exist. File path: ${cmdOptions._configPath}.`
        );
    }

    if (cmdOptions._outputPath) {
        if (cmdOptions._outputPath === path.parse(cmdOptions._outputPath).root) {
            throw new InvalidCommandOptionError(`The 'outputPath' must not be the same as system root directory.`);
        }

        if (isInFolder(cmdOptions._outputPath, process.cwd())) {
            throw new InvalidCommandOptionError(
                `The 'outputPath' must not be parent directory of current working directory.`
            );
        }
    }
}

function mergeBuildTaskFromCommandOptions(
    cmdOptions: ParsedBuildCommandOptions,
    buildTaskConfig: BuildTaskConfig
): boolean {
    if (
        !cmdOptions.clean &&
        !cmdOptions._copyEntries.length &&
        !cmdOptions._styleEntries.length &&
        !cmdOptions._scriptEntries.length
    ) {
        return false;
    }

    // clean
    if (cmdOptions.clean != null) {
        if (buildTaskConfig.clean == null || typeof buildTaskConfig.clean === 'boolean') {
            buildTaskConfig.clean = cmdOptions.clean;
        } else {
            if (buildTaskConfig.clean.beforeBuild) {
                buildTaskConfig.clean.beforeBuild.cleanOutDir = cmdOptions.clean;
            } else {
                buildTaskConfig.clean.beforeBuild = {
                    cleanOutDir: cmdOptions.clean
                };
            }
        }
    }

    // copy
    if (cmdOptions._copyEntries.length) {
        if (!buildTaskConfig.copy) {
            buildTaskConfig.copy = [...cmdOptions._copyEntries];
        } else {
            buildTaskConfig.copy = [...buildTaskConfig.copy, ...cmdOptions._copyEntries];
        }
    }

    // styles
    if (cmdOptions._styleEntries.length) {
        if (!buildTaskConfig.style) {
            buildTaskConfig.style = [...cmdOptions._styleEntries];
        } else {
            if (Array.isArray(buildTaskConfig.style)) {
                buildTaskConfig.style = [...buildTaskConfig.style, ...cmdOptions._styleEntries];
            } else {
                const bundleEntries = buildTaskConfig.style.bundles ?? [];
                cmdOptions._styleEntries.forEach((entry) => bundleEntries.push({ entry }));
                buildTaskConfig.style.bundles = bundleEntries;
            }
        }
    }

    // scripts
    if (cmdOptions._scriptEntries.length) {
        if (!buildTaskConfig.script) {
            buildTaskConfig.script = [...cmdOptions._scriptEntries];
        } else {
            if (Array.isArray(buildTaskConfig.script)) {
                buildTaskConfig.script = [...buildTaskConfig.script, ...cmdOptions._scriptEntries];
            } else {
                const bundleEntries = buildTaskConfig.script.bundles ?? [];
                cmdOptions._scriptEntries.forEach((entry) => bundleEntries.push({ entry }));
                buildTaskConfig.script.bundles = bundleEntries;
            }
        }
    }

    return true;
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

export async function getBuildTasks(cmdOptions: BuildCommandOptions): Promise<ParsedBuildTaskConfig[]> {
    const parsedCmdOptions = getParsedBuildCommandOptions(cmdOptions);
    await validateCommandOptions(parsedCmdOptions);

    let configPath = parsedCmdOptions._configPath;
    if (!configPath) {
        configPath = await findUp('libconfig.json', process.cwd(), path.parse(process.cwd()).root);
    }

    const workspaceRoot = configPath
        ? path.extname(configPath)
            ? path.dirname(configPath)
            : configPath
        : process.cwd();

    const buildTasks: ParsedBuildTaskConfig[] = [];

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

            if (!project.tasks?.build || project.tasks?.build.skip) {
                continue;
            }

            const buildTaskConfig = project.tasks.build;

            applyEnvOverrides(buildTaskConfig, parsedCmdOptions._env);

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot,
                projectName,
                configPath
            };

            const packageJsonInfo = await getPackageJsonInfo(workspaceInfo, parsedCmdOptions.version);

            const parsedBuildTask = getParsedBuildTaskConfig(
                buildTaskConfig,
                parsedCmdOptions,
                workspaceInfo,
                packageJsonInfo
            );

            buildTasks.push(parsedBuildTask);
        }
    }

    const firstBuildTaskConfig = buildTasks.length ? buildTasks[0] : {};
    const hasCommandOptionsBuildTask = mergeBuildTaskFromCommandOptions(parsedCmdOptions, firstBuildTaskConfig);
    if (hasCommandOptionsBuildTask && !buildTasks.length) {
        const workspaceInfo: WorkspaceInfo = {
            workspaceRoot,
            projectRoot: workspaceRoot,
            projectName: null,
            configPath
        };

        const packageJsonInfo = await getPackageJsonInfo(workspaceInfo, parsedCmdOptions.version);

        const parsedBuildTask = getParsedBuildTaskConfig(
            firstBuildTaskConfig,
            parsedCmdOptions,
            workspaceInfo,
            packageJsonInfo
        );

        buildTasks.push(parsedBuildTask);
    }

    return buildTasks;
}
