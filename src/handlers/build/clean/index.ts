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

async function getPathInfoes(relPaths: string[], cwd: string): Promise<PathInfo[]> {
    if (!relPaths.length) {
        return [];
    }

    const processedPaths: string[] = [];

    const pathInfoes: PathInfo[] = [];

    for (const pathOrPattern of relPaths) {
        if (!pathOrPattern.trim().length) {
            continue;
        }

        let normalizedPathOrPattern = normalizePathToPOSIXStyle(pathOrPattern);

        if (!normalizedPathOrPattern && /^[./\\]/.test(pathOrPattern)) {
            normalizedPathOrPattern = './';
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
                if (!isSystemRoot) {
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
            // We allow absolute path on Windows only.
            const absolutePath =
                isWindowsStyleAbsolute(normalizedPathOrPattern) && process.platform === 'win32'
                    ? path.resolve(normalizePathToPOSIXStyle(normalizedPathOrPattern))
                    : path.resolve(cwd, normalizePathToPOSIXStyle(normalizedPathOrPattern));
            if (processedPaths.includes(absolutePath)) {
                continue;
            }

            const isSystemRoot = isSamePaths(path.parse(absolutePath).root, absolutePath);
            let stats: Stats | null = null;
            if (!isSystemRoot && (await pathExists(absolutePath))) {
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
    private readonly cleanOutDir: boolean;

    constructor(readonly options: CleanTaskRunnerOptions) {
        this.cleanOutDir =
            this.options.runFor === 'before' &&
            (this.options.beforeOrAfterCleanOptions as BeforeBuildCleanOptions).cleanOutDir
                ? true
                : false;
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

        // cleanPathInfoes
        const cleanPathInfoes = await this.getCleanPathInfoes();
        if (!cleanPathInfoes.length) {
            return [];
        }

        // excludes
        const excludePathInfoes = await this.getExcludePathInfoes();

        // Delete output path only
        if (this.cleanOutDir && !excludePathInfoes.length) {
            await this.delete(outDir, outDirStats);

            return [outDir];
        }

        // addMagicAllFilesToCleanPathInfoes
        await this.addMagicAllFilesToCleanPathInfoes(cleanPathInfoes, excludePathInfoes);

        const cleanedPaths: string[] = [];

        for (const cleanPathInfo of cleanPathInfoes) {
            const pathToClean = cleanPathInfo.absolutePath;

            // Validation
            //
            if (cleanPathInfo.isSystemRoot) {
                throw new InvalidConfigError(
                    `Deleting root directory is not permitted, path: ${pathToClean}.`,
                    `${configLocationPrefix}.clean`
                );
            }

            if (isInFolder(pathToClean, workspaceRoot) || isSamePaths(pathToClean, workspaceRoot)) {
                throw new InvalidConfigError(
                    `Deleting current working directory is not permitted, path: ${pathToClean}.`,
                    `${configLocationPrefix}.clean`
                );
            }

            if (!isInFolder(workspaceRoot, pathToClean)) {
                throw new InvalidConfigError(
                    `Deleting outside of current working directory is disabled. Path: ${pathToClean}/`,
                    `${configLocationPrefix}.clean`
                );
            }

            if (!isSamePaths(outDir, pathToClean) && !isInFolder(outDir, pathToClean)) {
                throw new InvalidConfigError(
                    `Cleaning outside of the output directory is disabled. Path: ${pathToClean}.`,
                    `${configLocationPrefix}.clean`
                );
            }

            if (!cleanPathInfo.stats) {
                continue;
            }

            // If already cleaned
            if (cleanedPaths.includes(pathToClean) || cleanedPaths.find((p) => isSamePaths(p, pathToClean))) {
                continue;
            }

            // Exclude - if clean file is same as exclude file or directory
            if (excludePathInfoes.find((i) => isSamePaths(i.absolutePath, pathToClean))) {
                this.logger.debug(`Excluded from clean, path: ${pathToClean}.`);
                continue;
            }

            // Exclude - if clean file/directory is in exclude directory
            if (
                excludePathInfoes.find(
                    (i) => i.stats && i.stats.isDirectory() && isInFolder(i.absolutePath, pathToClean)
                )
            ) {
                this.logger.debug(`Excluded from clean, path: ${pathToClean}.`);
                continue;
            }

            // Exclude - if exclude file is in clean directory
            if (
                cleanPathInfo.stats.isDirectory() &&
                excludePathInfoes.find((i) => isInFolder(pathToClean, i.absolutePath))
            ) {
                this.logger.debug(`Excluded from clean, path: ${pathToClean}.`);
                continue;
            }

            await this.delete(pathToClean, cleanPathInfo.stats);
            cleanedPaths.push(pathToClean);
        }

        return cleanedPaths;
    }

    private async getCleanPathInfoes(): Promise<PathInfo[]> {
        const cleanOptions = this.options.beforeOrAfterCleanOptions;
        const combinedCleanPaths = cleanOptions.paths ?? [];
        if (this.cleanOutDir) {
            // Must be relative path
            combinedCleanPaths.push('./');
        }

        if (!combinedCleanPaths.length) {
            return [];
        }

        const cleanPathInfoes = await getPathInfoes(combinedCleanPaths, this.options.outDir);

        return cleanPathInfoes;
    }

    private async addMagicAllFilesToCleanPathInfoes(
        cleanPathInfoes: PathInfo[],
        excludePathInfoes: PathInfo[]
    ): Promise<void> {
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
            const relToOutDir = normalizePathToPOSIXStyle(path.relative(this.options.outDir, dirPathToClean));
            // Must be relative path
            extraCleanDirPatterns.push(`${relToOutDir}/**/*`);
        }

        const extraCleanPathInfoes = await getPathInfoes(extraCleanDirPatterns, this.options.outDir);
        if (extraCleanPathInfoes.length) {
            cleanPathInfoes.push(...extraCleanPathInfoes);
        }
    }

    private getExcludePathInfoes(): Promise<PathInfo[]> {
        const cleanOptions = this.options.beforeOrAfterCleanOptions;

        return getPathInfoes(cleanOptions.exclude ?? [], this.options.outDir);
    }

    private async delete(pathToDelete: string, stats: Stats): Promise<void> {
        const cleanOutDir = isSamePaths(pathToDelete, this.options.outDir) ? true : false;
        const relToWorkspace = normalizePathToPOSIXStyle(
            path.relative(this.options.workspaceInfo.workspaceRoot, pathToDelete)
        );

        const msgPrefix = cleanOutDir ? 'Deleting output directory' : 'Deleting';
        this.logger.info(`${msgPrefix} ${relToWorkspace}`);

        if (!this.options.dryRun) {
            if (stats.isDirectory() && !stats.isSymbolicLink()) {
                await fs.rm(pathToDelete, {
                    recursive: true,
                    force: true,
                    maxRetries: 2,
                    retryDelay: 1000
                });
            } else {
                await fs.unlink(pathToDelete);
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
                        (buildTask.clean.beforeBuild.paths &&
                            !buildTask.clean.beforeBuild.paths.filter((p) => p.trim().length).length))))
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
    } else if (
        typeof buildTask.clean === 'object' &&
        buildTask.clean.afterBuild?.paths?.filter((p) => p.trim().length).length
    ) {
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
