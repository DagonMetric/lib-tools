import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { BuildTask } from '../models/index.js';
import { isInFolder } from '../utils/index.js';

import { ParsedCommandOptions } from './parsed-command-options.js';
import { ParsedTask, ParsedTaskImpl, TaskHandlerFn, WorkspaceInfo, getParsedTask } from './parsed-task.js';

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

export interface ParsedBuildTask extends BuildTask, ParsedTask {
    readonly _packageJsonInfo: PackageJsonInfo | null;
    _outDir: string;
}

export class ParsedBuildTaskImpl extends ParsedTaskImpl implements ParsedBuildTask {
    readonly _packageJsonInfo: PackageJsonInfo | null;
    readonly _outDir: string;

    constructor(
        buildTask: BuildTask,
        workspaceInfo: WorkspaceInfo,
        cmdOptions: ParsedCommandOptions,
        packageJsonInfo: PackageJsonInfo | null,
        taskHandler: TaskHandlerFn | null
    ) {
        super('build', buildTask, workspaceInfo, taskHandler);

        Object.assign(this, buildTask);

        this._packageJsonInfo = packageJsonInfo;

        const projectRoot = this._workspaceInfo.projectRoot;

        this._outDir = buildTask.outDir
            ? path.resolve(projectRoot, buildTask.outDir)
            : cmdOptions._outDir
            ? cmdOptions._outDir
            : path.resolve(projectRoot, 'dist');
    }
}

function validateConfig(config: ParsedBuildTask): void {
    const outDir = config._outDir;
    const workspaceRoot = config._workspaceInfo.workspaceRoot;
    const projectRoot = config._workspaceInfo.projectRoot;
    const projectName = config._workspaceInfo.projectName ?? '0';

    const configLocationPrefix = `projects[${projectName}].tasks.build`;

    if (outDir === path.parse(outDir).root || outDir === path.parse(projectRoot).root) {
        throw new InvalidConfigError(
            `The 'outDir' must not be system root directory.`,
            `${configLocationPrefix}.outDir`
        );
    }

    if (isInFolder(outDir, workspaceRoot)) {
        throw new InvalidConfigError(
            `The 'outDir' must not be the parent of current working directory.`,
            `${configLocationPrefix}.outDir`
        );
    }

    if (isInFolder(outDir, projectRoot)) {
        throw new InvalidConfigError(
            `The 'outDir' must not be the parent of project root directory.`,
            `${configLocationPrefix}.outDir`
        );
    }
}

export async function getParsedBuildTask(
    buildTask: BuildTask,
    workspaceInfo: WorkspaceInfo,
    cmdOptions: ParsedCommandOptions,
    packageJsonInfo: PackageJsonInfo | null
): Promise<ParsedBuildTask> {
    const parsedTask = await getParsedTask('build', buildTask, workspaceInfo);

    const parsedBuildTask = new ParsedBuildTaskImpl(
        buildTask,
        workspaceInfo,
        cmdOptions,
        packageJsonInfo,
        parsedTask._handleTask
    );

    validateConfig(parsedBuildTask);

    return parsedBuildTask;
}
