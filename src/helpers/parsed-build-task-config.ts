import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { BuildTaskConfig } from '../models/index.js';
import { isInFolder } from '../utils/index.js';

import { ParsedCommandOptions } from './parsed-command-options.js';
import { ParsedTaskConfig, ParsedTaskConfigImpl, WorkspaceInfo } from './parsed-task-config.js';

export interface PackageJsonInfo {
    readonly packageJson: Record<string, unknown>;
    readonly packageJsonPath: string;
    readonly packageName: string;
    readonly packageNameWithoutScope: string;
    readonly packageScope: string | null;
    readonly isNestedPackage: boolean;
    readonly packageVersion: string | null;
    readonly rootPackageJson: Record<string, unknown> | null;
    readonly rootPackageJsonPath: string | null;
}

export interface ParsedBuildTaskConfig extends BuildTaskConfig, ParsedTaskConfig {
    readonly packageJsonInfo: PackageJsonInfo | null;
    _outputPath: string;
}

export class ParsedBuildTaskConfigImpl extends ParsedTaskConfigImpl implements ParsedBuildTaskConfig {
    readonly packageJsonInfo: PackageJsonInfo | null;
    readonly _outputPath: string;

    constructor(
        config: BuildTaskConfig,
        workspaceInfo: WorkspaceInfo,
        cmdOptions: ParsedCommandOptions,
        packageJsonInfo: PackageJsonInfo | null
    ) {
        super('build', config, workspaceInfo);

        Object.assign(this, config);

        this.packageJsonInfo = packageJsonInfo;

        const projectRoot = this.workspaceInfo.projectRoot;

        this._outputPath = config.outputPath
            ? path.resolve(projectRoot, config.outputPath)
            : cmdOptions._outputPath
            ? cmdOptions._outputPath
            : path.resolve(projectRoot, 'dist');
    }
}

function validateConfig(config: ParsedBuildTaskConfig): void {
    const outputPath = config._outputPath;
    const workspaceRoot = config.workspaceInfo.workspaceRoot;
    const projectRoot = config.workspaceInfo.projectRoot;
    const projectName = config.workspaceInfo.projectName ?? '0';

    const configLocationPrefix = `projects[${projectName}].tasks.build`;

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

export function getParsedBuildTaskConfig(
    config: BuildTaskConfig,
    workspaceInfo: WorkspaceInfo,
    cmdOptions: ParsedCommandOptions,
    packageJsonInfo: PackageJsonInfo | null
): ParsedBuildTaskConfig {
    const parsedBuildTaskConfig = new ParsedBuildTaskConfigImpl(config, workspaceInfo, cmdOptions, packageJsonInfo);

    validateConfig(parsedBuildTaskConfig);

    return parsedBuildTaskConfig;
}
