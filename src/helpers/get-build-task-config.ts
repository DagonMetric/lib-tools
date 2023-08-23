import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { BuildTaskConfig, ParsedBuildTaskConfig, ParsedBuildCommandOptions } from '../models/index.js';
import { isInFolder } from '../utils/index.js';

import { getBannerText } from './get-banner-text.js';
import { getPackageJsonOptions } from './get-package-json-options.js';

export function getBuildTaskConfigFromCommandOptions(
    commandOptions: ParsedBuildCommandOptions
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

    const buildTaskConfig: BuildTaskConfig = {
        outputPath: commandOptions._outputPath
    };

    if (commandOptions.clean) {
        buildTaskConfig.clean = true;
    }

    if (commandOptions._copyEntries.length) {
        buildTaskConfig.copy = [...commandOptions._copyEntries];
    }

    if (commandOptions._styleEntries.length) {
        buildTaskConfig.style = [...commandOptions._styleEntries];
    }

    if (commandOptions._scriptEntries.length) {
        buildTaskConfig.script = [...commandOptions._scriptEntries];
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
    const bannerText = await getBannerText({
        banner: buildTaskConfig.banner,
        projectRoot,
        workspaceRoot,
        packageName: packageJsonOptions?._packageName,
        packageVersion: packageJsonOptions?._packageVersion,
        configLocationPrefix
    });

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
