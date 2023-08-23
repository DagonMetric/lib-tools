import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { BuildTaskConfig, ParsedBuildTaskConfig, ParsedBuildCommandOptions } from '../models/index.js';
import { findUp, isInFolder } from '../utils/index.js';

import { getPackageJsonOptions } from './get-package-json-options.js';
import { parseBannerText } from './parse-banner-text.js';

export function getBuildTaskConfigFromCommandOptions(
    commandOptions: ParsedBuildCommandOptions,
    buildTasks: BuildTaskConfig[]
): BuildTaskConfig | null {
    if (
        !commandOptions._outputPath ||
        (!commandOptions.clean &&
            !commandOptions._copyEntries.length &&
            !commandOptions._styleEntries.length &&
            !commandOptions._scriptEntries.length)
    ) {
        return null;
    }

    const buildTaskConfig: BuildTaskConfig = buildTasks.length
        ? buildTasks[0]
        : {
              outputPath: commandOptions._outputPath
          };

    // clean
    if (commandOptions.clean != null) {
        if (buildTaskConfig.clean == null || typeof buildTaskConfig.clean === 'boolean') {
            buildTaskConfig.clean = commandOptions.clean;
        } else {
            if (buildTaskConfig.clean.beforeBuild) {
                buildTaskConfig.clean.beforeBuild.cleanOutDir = commandOptions.clean;
            } else {
                buildTaskConfig.clean.beforeBuild = {
                    cleanOutDir: commandOptions.clean
                };
            }
        }
    }

    // copy
    if (commandOptions._copyEntries.length) {
        if (!buildTaskConfig.copy) {
            buildTaskConfig.copy = [...commandOptions._copyEntries];
        } else {
            buildTaskConfig.copy = [...buildTaskConfig.copy, ...commandOptions._copyEntries];
        }
    }

    // styles
    if (commandOptions._styleEntries.length) {
        if (!buildTaskConfig.style) {
            buildTaskConfig.style = [...commandOptions._styleEntries];
        } else {
            if (Array.isArray(buildTaskConfig.style)) {
                buildTaskConfig.style = [...buildTaskConfig.style, ...commandOptions._styleEntries];
            } else {
                const bundleEntries = buildTaskConfig.style.bundles ?? [];
                commandOptions._styleEntries.forEach((entry) => bundleEntries.push({ entry }));
                buildTaskConfig.style.bundles = bundleEntries;
            }
        }
    }

    // scripts
    if (commandOptions._scriptEntries.length) {
        if (!buildTaskConfig.script) {
            buildTaskConfig.script = [...commandOptions._scriptEntries];
        } else {
            if (Array.isArray(buildTaskConfig.script)) {
                buildTaskConfig.script = [...buildTaskConfig.script, ...commandOptions._scriptEntries];
            } else {
                const bundleEntries = buildTaskConfig.script.bundles ?? [];
                commandOptions._scriptEntries.forEach((entry) => bundleEntries.push({ entry }));
                buildTaskConfig.script.bundles = bundleEntries;
            }
        }
    }

    return buildTaskConfig;
}

export async function getParsedBuildTaskConfig(
    buildTaskConfig: BuildTaskConfig,
    commandOptions: ParsedBuildCommandOptions,
    projectConfig: { workspaceRoot: string; projectRoot: string; projectName: string | null; configPath: string | null }
): Promise<ParsedBuildTaskConfig> {
    const { workspaceRoot, projectRoot, projectName, configPath } = projectConfig;
    const configLocationPrefix = `projects[${projectName}].tasks.build`;

    let outputPath = commandOptions._outputPath;

    if (buildTaskConfig.outputPath) {
        outputPath = path.resolve(projectRoot, buildTaskConfig.outputPath);

        if (outputPath === path.parse(outputPath).root || outputPath === path.parse(projectRoot).root) {
            throw new InvalidConfigError(
                `The 'outputPath' must not be system root directory.`,
                `${configLocationPrefix}.outputPath`
            );
        }

        if (isInFolder(outputPath, workspaceRoot)) {
            throw new InvalidConfigError(
                `The 'outputPath' must not be the parent of current working directory.`,
                `${configLocationPrefix}.outputPath`
            );
        }

        if (isInFolder(outputPath, projectRoot)) {
            throw new InvalidConfigError(
                `The 'outputPath' must not be the parent of project root directory.`,
                `${configLocationPrefix}.outputPath`
            );
        }
    }

    if (!outputPath) {
        throw new InvalidConfigError(
            `The 'outputPath' could not be detected. Set the 'outputPath' option in command args or configuration file.`,
            `${configLocationPrefix}.outputPath`
        );
    }

    // package.json options
    const packageJsonOptions = await getPackageJsonOptions({
        projectRoot,
        workspaceRoot,
        outputPath,
        versionToOverride: commandOptions.version
    });

    // banner
    let bannerText: string | null = null;
    if (buildTaskConfig.banner) {
        let rawBanner = buildTaskConfig.banner.trim();

        if (/\.txt$/i.test(rawBanner)) {
            const bannerFilePath = await findUp(rawBanner, projectRoot, workspaceRoot);
            if (bannerFilePath) {
                rawBanner = await fs.readFile(rawBanner, 'utf-8');
            }
        }

        bannerText = parseBannerText({
            banner: rawBanner,
            packageName: packageJsonOptions?._packageName,
            packageVersion: packageJsonOptions?._packageVersion
        });
    }

    const parsedBuildTaskConfig: ParsedBuildTaskConfig = {
        ...buildTaskConfig,
        _workspaceRoot: workspaceRoot,
        _projectRoot: projectRoot,
        _projectName: projectName,
        _outputPath: outputPath,
        _configPath: configPath,
        _packageJsonOptions: packageJsonOptions,
        _bannerText: bannerText
    };

    return parsedBuildTaskConfig;
}
