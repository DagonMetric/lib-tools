import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { BuildTask } from '../models/index.js';
import { PackageJsonInfo, ParsedBuildTask, WorkspaceInfo } from '../models/parsed/index.js';
import { isInFolder, isSamePaths, isWindowsStyleAbsolute, normalizePathToPOSIXStyle } from '../utils/index.js';

export function validateOutDir(outDir: string, workspaceInfo: WorkspaceInfo): void {
    const workspaceRoot = workspaceInfo.workspaceRoot;
    const projectRoot = workspaceInfo.projectRoot;
    const projectName = workspaceInfo.projectName ?? '0';
    const configLocationPrefix = `projects[${projectName}].tasks.build`;
    const configPath = workspaceInfo.configPath;

    if (!outDir?.trim().length) {
        throw new InvalidConfigError(`The 'outDir' must not be empty.`, configPath, `${configLocationPrefix}.outDir`);
    }

    if (outDir.trim() === '/' || outDir.trim() === '\\' || isSamePaths(outDir, path.parse(outDir).root)) {
        throw new InvalidConfigError(
            `The 'outDir' must not be system root directory.`,
            configPath,
            `${configLocationPrefix}.outDir`
        );
    }

    if (isInFolder(outDir, workspaceRoot) || isInFolder(outDir, process.cwd())) {
        throw new InvalidConfigError(
            `The 'outDir' must not be parent of worksapce root or current working directory.`,
            configPath,
            `${configLocationPrefix}.outDir`
        );
    }

    if (isInFolder(outDir, projectRoot)) {
        throw new InvalidConfigError(
            `The 'outDir' must not be parent of project root directory.`,
            configPath,
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

    const outDir = buildTask.outDir?.trim().length
        ? isWindowsStyleAbsolute(buildTask.outDir) && process.platform === 'win32'
            ? path.resolve(normalizePathToPOSIXStyle(buildTask.outDir))
            : path.resolve(projectRoot, normalizePathToPOSIXStyle(buildTask.outDir))
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

    validateOutDir(outDir, workspaceInfo);

    return parsedBuildTask;
}
