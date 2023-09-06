import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { BuildTask } from '../models/index.js';
import { PackageJsonInfo, ParsedBuildTask, WorkspaceInfo } from '../models/parsed/index.js';
import { isInFolder } from '../utils/index.js';

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

export function toParsedBuildTask(
    buildTask: BuildTask,
    workspaceInfo: WorkspaceInfo,
    packageJsonInfo: PackageJsonInfo | null,
    cmdOptionsOutDirAbs: string | null
): ParsedBuildTask {
    const projectRoot = workspaceInfo.projectRoot;
    const outDir = buildTask.outDir
        ? path.resolve(projectRoot, buildTask.outDir)
        : cmdOptionsOutDirAbs
        ? cmdOptionsOutDirAbs
        : path.resolve(projectRoot, 'dist');

    const parsedBuildTask: ParsedBuildTask = {
        _taskName: 'build',
        _workspaceInfo: workspaceInfo,
        _packageJsonInfo: packageJsonInfo,
        _outDir: outDir,
        ...buildTask
    };

    validateConfig(parsedBuildTask);

    return parsedBuildTask;
}
