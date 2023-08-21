import * as path from 'node:path';

import { InternalError, InvalidConfigError } from '../exceptions/index.js';
import { BuildCommandOptions, BuildTaskConfig, ParsedBuildTaskConfig, ParsedProjectConfig } from '../models/index.js';
import { isInFolder, isSamePaths } from '../utils/index.js';

import { findNodeModulesPath } from './find-node-modules-path.js';

import { parseCopyAssets } from './parse-copy-assets.js';
import { parseBannerText } from './parse-banner-text.js';
import { parsePackageJson } from './parse-package-json.js';

export async function parsedBuildTaskConfig(
    projectConfig: ParsedProjectConfig,
    buildCommandOptions: BuildCommandOptions
): Promise<ParsedBuildTaskConfig> {
    if (!projectConfig.tasks?.build) {
        throw new InternalError('No build task is configured.');
    }

    const buildTaskConfig = JSON.parse(JSON.stringify(projectConfig.tasks.build)) as BuildTaskConfig;
    const workspaceRoot = projectConfig._workspaceRoot;
    const projectRoot = projectConfig._projectRoot;
    const projectName = projectConfig._projectName;

    let outputPathAbs: string | null = null;

    if (buildTaskConfig.outputPath) {
        const configErrorLocation = `projects[${projectName}].outputPath`;
        if (path.isAbsolute(buildTaskConfig.outputPath)) {
            throw new InvalidConfigError(`The '${configErrorLocation}' must be relative path.`);
        }

        outputPathAbs = path.resolve(projectRoot, buildTaskConfig.outputPath);

        if (isSamePaths(workspaceRoot, outputPathAbs)) {
            throw new InvalidConfigError(
                `The '${configErrorLocation}' must not be the same as workspace root directory.`
            );
        }

        if (isSamePaths(projectRoot, outputPathAbs)) {
            throw new InvalidConfigError(
                `The '${configErrorLocation}' must not be the same as project root directory.`
            );
        }

        if (outputPathAbs === path.parse(outputPathAbs).root) {
            throw new InvalidConfigError(`The '${configErrorLocation}' must not be the same as system root directory.`);
        }

        const projectRootRoot = path.parse(projectRoot).root;
        if (outputPathAbs === projectRootRoot) {
            throw new InvalidConfigError(`The '${configErrorLocation}' must not be the same as system root directory.`);
        }

        if (isInFolder(outputPathAbs, workspaceRoot)) {
            throw new InvalidConfigError(
                `The workspace root folder must not be inside output directory. Change outputPath in 'projects[${projectName}].outputPath'.`
            );
        }

        if (isInFolder(outputPathAbs, projectRoot)) {
            throw new InvalidConfigError(
                `The project root folder must not be inside output directory. Change outputPath in 'projects[${projectName}].outputPath'.`
            );
        }
    }

    if (!outputPathAbs) {
        throw new InvalidConfigError(
            `The outputPath could not be automatically detected. Set value in 'projects[${projectName}].tasks.build.outputPath' manually.`
        );
    }

    const nodeModulesPath = await findNodeModulesPath(workspaceRoot);
    const packageJson = await parsePackageJson(buildCommandOptions, projectRoot, workspaceRoot, outputPathAbs);

    const parsedBuildTaskConfig: ParsedBuildTaskConfig = {
        ...buildTaskConfig,
        _config: projectConfig._config,
        _nodeModulesPath: nodeModulesPath,
        _workspaceRoot: workspaceRoot,
        _projectRoot: projectRoot,
        _projectName: projectName,
        _outputPath: outputPathAbs,

        _packageJson: packageJson
    };

    // Banner
    await parseBannerText(parsedBuildTaskConfig);

    // Copy assets
    await parseCopyAssets(parsedBuildTaskConfig);

    return parsedBuildTaskConfig;
}
