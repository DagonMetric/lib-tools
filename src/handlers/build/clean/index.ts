import { glob } from 'glob';
import { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidConfigError } from '../../../exceptions/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../../../helpers/index.js';
import { AfterBuildCleanOptions, BeforeBuildCleanOptions, CleanOptions } from '../../../models/index.js';
import {
    Logger,
    isInFolder,
    isSamePaths,
    isWindowsStyleAbsolute,
    normalizePathToPOSIXStyle,
    pathExists
} from '../../../utils/index.js';

interface PathInfo {
    readonly absolutePath: string;
    readonly stats: Stats | null;
    readonly isSystemRoot?: boolean;
}

async function getPathInfoes(paths: string[], cwd: string, forExclude: boolean): Promise<PathInfo[]> {
    if (!paths?.length) {
        return [];
    }

    const processedPaths: string[] = [];

    const pathInfoes: PathInfo[] = [];

    for (const pathOrPattern of paths) {
        if (!pathOrPattern.trim().length) {
            continue;
        }

        let normalizedPathOrPattern = normalizePathToPOSIXStyle(pathOrPattern);

        if (!normalizedPathOrPattern && /^[./\\]/.test(pathOrPattern)) {
            normalizedPathOrPattern = '/';
        }

        if (!normalizedPathOrPattern) {
            continue;
        }

        if (glob.hasMagic(normalizedPathOrPattern)) {
            const foundPaths = await glob(normalizedPathOrPattern, { cwd, dot: true, absolute: true });
            for (const absolutePath of foundPaths) {
                if (processedPaths.includes(absolutePath)) {
                    continue;
                }

                const isSystemRoot = isSamePaths(path.parse(absolutePath).root, absolutePath);
                let stats: Stats | null = null;
                if (!isSystemRoot && !forExclude) {
                    stats = await fs.stat(absolutePath);
                }

                processedPaths.push(absolutePath);
                pathInfoes.push({
                    absolutePath,
                    isSystemRoot,
                    stats
                });
            }
        } else {
            const absolutePath = isWindowsStyleAbsolute(normalizedPathOrPattern)
                ? path.resolve(normalizePathToPOSIXStyle(normalizedPathOrPattern))
                : path.resolve(cwd, normalizePathToPOSIXStyle(normalizedPathOrPattern));
            if (processedPaths.includes(absolutePath)) {
                continue;
            }

            const isSystemRoot = isSamePaths(path.parse(absolutePath).root, absolutePath);
            let stats: Stats | null = null;
            if (!isSystemRoot && !forExclude && (await pathExists(absolutePath))) {
                stats = await fs.stat(absolutePath);
            }

            processedPaths.push(absolutePath);
            pathInfoes.push({
                absolutePath,
                isSystemRoot,
                stats
            });
        }
    }

    return pathInfoes;
}

export interface CleanTaskRunnerOptions {
    readonly runFor: 'before' | 'after';
    readonly beforeOrAfterCleanOptions: BeforeBuildCleanOptions | AfterBuildCleanOptions;
    readonly dryRun: boolean;
    readonly workspaceInfo: WorkspaceInfo;
    readonly outDir: string;
    readonly logger: Logger;
}

export class CleanTaskRunner {
    private readonly logger: Logger;

    constructor(readonly options: CleanTaskRunnerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<string[]> {
        const workspaceRoot = this.options.workspaceInfo.workspaceRoot;
        const projectRoot = this.options.workspaceInfo.projectRoot;
        const outDir = this.options.outDir;
        const configLocationPrefix = `projects[${this.options.workspaceInfo.projectName ?? '0'}].tasks.build`;

        // Validating outDir
        //
        if (!outDir?.trim().length) {
            throw new InvalidConfigError(`The 'outDir' must not be empty.`, `${configLocationPrefix}.outDir`);
        }

        if (outDir.trim() === '/' || outDir.trim() === '\\' || isSamePaths(outDir, path.parse(outDir).root)) {
            throw new InvalidConfigError(
                `The 'outDir' must not be system root directory.`,
                `${configLocationPrefix}.outDir`
            );
        }

        if (isInFolder(outDir, workspaceRoot) || isInFolder(outDir, process.cwd())) {
            throw new InvalidConfigError(
                `The 'outDir' must not be parent of worksapce root or current working directory.`,
                `${configLocationPrefix}.outDir`
            );
        }

        if (isInFolder(outDir, projectRoot)) {
            throw new InvalidConfigError(
                `The 'outDir' must not be parent of project root directory.`,
                `${configLocationPrefix}.outDir`
            );
        }

        if (!(await pathExists(outDir))) {
            return [];
        }
        const outDirStats = await fs.stat(outDir);
        if (outDirStats.isFile()) {
            throw new InvalidConfigError(`The 'outDir' must be directory.`, `${configLocationPrefix}.outDir`);
        }

        const cleanOptions = this.options.beforeOrAfterCleanOptions;
        const cleanOutDir = this.options.runFor === 'before' && (cleanOptions as BeforeBuildCleanOptions).cleanOutDir;
        const allCleanPaths = cleanOptions.paths ?? [];
        if (cleanOutDir) {
            allCleanPaths.push(outDir);
        }

        if (!allCleanPaths.length) {
            return [];
        }

        const cleanPathInfoes = await getPathInfoes(allCleanPaths, outDir, false);
        if (!cleanPathInfoes.length) {
            return [];
        }

        const excludePathInfoes = await getPathInfoes(cleanOptions.exclude ?? [], outDir, true);

        if (cleanOutDir && !excludePathInfoes.length) {
            await this.delete({ absolutePath: outDir, stats: outDirStats });

            return [outDir];
        }

        const dirPathsToClean: string[] = [];
        for (const pathInfo of cleanPathInfoes) {
            if (pathInfo.stats?.isDirectory()) {
                dirPathsToClean.push(pathInfo.absolutePath);
            }
        }
        const sortedDirPathsToClean = dirPathsToClean.sort((a, b) => b.length - a.length);
        const processedCleanDirs: string[] = [];
        const extraCleanDirPatterns: string[] = [];
        for (const dirPathToClean of sortedDirPathsToClean) {
            if (
                processedCleanDirs.find((p) => isInFolder(p, dirPathToClean)) ??
                !excludePathInfoes.find((i) => isInFolder(dirPathToClean, i.absolutePath))
            ) {
                continue;
            }

            processedCleanDirs.push(dirPathToClean);
            extraCleanDirPatterns.push(path.join(dirPathToClean, '**/*'));
        }

        const extraCleanPathInfoes = await getPathInfoes(extraCleanDirPatterns, outDir, false);
        if (extraCleanPathInfoes.length) {
            cleanPathInfoes.push(...extraCleanPathInfoes);
        }

        const cleanedPaths: string[] = [];

        for (const cleanPathInfo of cleanPathInfoes) {
            // Validation
            //
            if (cleanPathInfo.isSystemRoot) {
                throw new InvalidConfigError(
                    `Deleting root directory is not permitted, path: ${cleanPathInfo.absolutePath}.`,
                    `${configLocationPrefix}.clean`
                );
            }

            if (
                isInFolder(cleanPathInfo.absolutePath, workspaceRoot) ||
                isSamePaths(cleanPathInfo.absolutePath, workspaceRoot)
            ) {
                throw new InvalidConfigError(
                    `Deleting current working directory is not permitted, path: ${cleanPathInfo.absolutePath}.`,
                    `${configLocationPrefix}.clean`
                );
            }

            if (!isInFolder(workspaceRoot, cleanPathInfo.absolutePath)) {
                throw new InvalidConfigError(
                    `Deleting outside of current working directory is disabled. Path: ${cleanPathInfo.absolutePath}/`,
                    `${configLocationPrefix}.clean`
                );
            }

            if (!isSamePaths(outDir, cleanPathInfo.absolutePath) && !isInFolder(outDir, cleanPathInfo.absolutePath)) {
                throw new InvalidConfigError(
                    `Cleaning outside of the output directory is disabled. Path: ${cleanPathInfo.absolutePath}.`,
                    `${configLocationPrefix}.clean`
                );
            }

            if (!cleanPathInfo.stats) {
                continue;
            }

            const pathToClean = cleanPathInfo.absolutePath;

            if (cleanedPaths.includes(pathToClean) || cleanedPaths.find((p) => isSamePaths(p, pathToClean))) {
                continue;
            }

            if (excludePathInfoes.find((i) => isSamePaths(i.absolutePath, pathToClean))) {
                continue;
            }

            if (
                cleanPathInfo.stats.isDirectory() &&
                excludePathInfoes.find((i) => isInFolder(pathToClean, i.absolutePath))
            ) {
                continue;
            }

            await this.delete(cleanPathInfo);
            cleanedPaths.push(pathToClean);
        }

        return cleanedPaths;
    }

    private async delete(cleanPathInfo: PathInfo): Promise<void> {
        const stats = cleanPathInfo.stats;
        if (!stats) {
            return;
        }

        const cleanOutDir = isSamePaths(cleanPathInfo.absolutePath, this.options.outDir) ? true : false;
        const relToWorkspace = normalizePathToPOSIXStyle(
            path.relative(this.options.workspaceInfo.workspaceRoot, cleanPathInfo.absolutePath)
        );

        const msgPrefix = cleanOutDir ? 'Deleting output directory' : 'Deleting';
        this.logger.info(`${msgPrefix} ${relToWorkspace}`);

        if (!this.options.dryRun) {
            if (stats.isDirectory() && !stats.isSymbolicLink()) {
                await fs.rm(cleanPathInfo.absolutePath, {
                    recursive: true,
                    force: true,
                    maxRetries: 2,
                    retryDelay: 1000
                });
            } else {
                await fs.unlink(cleanPathInfo.absolutePath);
            }
        }
    }
}

export function getCleanTaskRunner(
    runFor: 'before' | 'after',
    buildTask: ParsedBuildTask,
    logger: Logger,
    dryRun = false
): CleanTaskRunner | null {
    if (!buildTask.clean) {
        return null;
    }

    if (runFor === 'before') {
        if (
            typeof buildTask.clean === 'object' &&
            (!buildTask.clean.beforeBuild ||
                (!buildTask.clean.beforeBuild.cleanOutDir &&
                    (!buildTask.clean.beforeBuild.paths ||
                        (buildTask.clean.beforeBuild.paths && !buildTask.clean.beforeBuild.paths.length))))
        ) {
            return null;
        }

        const cleanOptions =
            typeof buildTask.clean === 'object'
                ? buildTask.clean
                : ({
                      beforeBuild: {
                          cleanOutDir: true
                      }
                  } as CleanOptions);

        const beforeBuildCleanOptions = cleanOptions.beforeBuild ?? {};

        const cleanTaskRunner = new CleanTaskRunner({
            runFor: 'before',
            beforeOrAfterCleanOptions: beforeBuildCleanOptions,
            dryRun,
            workspaceInfo: buildTask._workspaceInfo,
            outDir: buildTask._outDir,
            logger
        });

        return cleanTaskRunner;
    } else if (typeof buildTask.clean === 'object' && buildTask.clean.afterBuild?.paths?.length) {
        const cleanOptions = buildTask.clean;
        const afterBuildCleanOptions = cleanOptions.afterBuild ?? {};

        const cleanTaskRunner = new CleanTaskRunner({
            runFor: 'after',
            beforeOrAfterCleanOptions: afterBuildCleanOptions,
            dryRun,
            workspaceInfo: buildTask._workspaceInfo,
            outDir: buildTask._outDir,
            logger
        });

        return cleanTaskRunner;
    }

    return null;
}
