import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { AfterBuildCleanOptions, BeforeBuildCleanOptions, CleanOptions } from '../../../config-models/index.js';
import { WorkspaceInfo } from '../../../config-models/parsed/index.js';
import { InvalidConfigError } from '../../../exceptions/index.js';
import {
    AbsolutePathInfo,
    Logger,
    getAbsolutePathInfoes,
    isInFolder,
    isSamePaths,
    normalizePathToPOSIXStyle,
    pathExists
} from '../../../utils/index.js';

import { BuildTaskHandleContext } from '../../interfaces/index.js';

export interface CleanTaskRunnerOptions {
    readonly runFor: 'before' | 'after';
    readonly beforeOrAfterCleanOptions: BeforeBuildCleanOptions | AfterBuildCleanOptions;
    readonly workspaceInfo: WorkspaceInfo;
    readonly outDir: string;
    readonly dryRun: boolean;
    readonly logger: Logger;
}

export interface CleanTaskResult {
    readonly cleanedPathInfoes: AbsolutePathInfo[];
    readonly excludedPaths: string[];
}

export class CleanTaskRunner {
    private readonly logger: Logger;
    private readonly cleanOutDir: boolean;
    private readonly configLocationPrefix: string;
    private readonly configPath: string | null;

    constructor(readonly options: CleanTaskRunnerOptions) {
        this.cleanOutDir =
            this.options.runFor === 'before' &&
            (this.options.beforeOrAfterCleanOptions as BeforeBuildCleanOptions).cleanOutDir
                ? true
                : false;
        this.logger = this.options.logger;
        this.configPath = this.options.workspaceInfo.configPath;
        this.configLocationPrefix = `projects/${this.options.workspaceInfo.projectName ?? '0'}/tasks/build`;
    }

    async run(): Promise<CleanTaskResult> {
        const outDir = this.options.outDir;

        if (!(await pathExists(outDir))) {
            return {
                cleanedPathInfoes: [],
                excludedPaths: []
            };
        }

        const outDirStats = await fs.stat(outDir);
        if (!outDirStats.isDirectory()) {
            throw new InvalidConfigError(
                `The 'outDir' must be directory.`,
                this.configPath,
                `${this.configLocationPrefix}/outDir`
            );
        }

        // cleanPathInfoes
        const cleanPathInfoes = await this.getCleanPathInfoes();
        if (!cleanPathInfoes.length) {
            return {
                cleanedPathInfoes: [],
                excludedPaths: []
            };
        }

        // excludes
        const excludePathInfoes = await this.getExcludePathInfoes();

        // Delete output path only
        if (this.cleanOutDir && !excludePathInfoes.length) {
            const outDirPathInfo: AbsolutePathInfo = {
                path: outDir,
                isSystemRoot: false,
                isDirectory: true,
                isFile: false,
                isSymbolicLink: outDirStats.isSymbolicLink()
            };
            await this.delete(outDirPathInfo);

            return {
                cleanedPathInfoes: [outDirPathInfo],
                excludedPaths: []
            };
        }

        // addAllFilesGlobMagicToCleanPathInfoes
        await this.addAllFilesGlobMagicToCleanPathInfoes(cleanPathInfoes, excludePathInfoes);

        const cleanTaskResult: CleanTaskResult = {
            cleanedPathInfoes: [],
            excludedPaths: []
        };

        for (const cleanPathInfo of cleanPathInfoes) {
            // Validation
            this.validateCleanPath(cleanPathInfo);

            // If already cleaned
            if (cleanTaskResult.cleanedPathInfoes.find((pathInfo) => isSamePaths(pathInfo.path, cleanPathInfo.path))) {
                continue;
            }

            // If already excluded
            if (cleanTaskResult.excludedPaths.find((p) => isSamePaths(p, cleanPathInfo.path))) {
                continue;
            }

            // Exclude - if clean file is same as exclude file or directory
            if (excludePathInfoes.find((i) => isSamePaths(i.path, cleanPathInfo.path))) {
                this.logger.debug(`Excluded from clean, path: ${cleanPathInfo.path}.`);
                cleanTaskResult.excludedPaths.push(cleanPathInfo.path);
                continue;
            }

            // Exclude - if clean file/directory is in exclude directory
            if (excludePathInfoes.find((i) => i.isDirectory && isInFolder(i.path, cleanPathInfo.path))) {
                this.logger.debug(`Excluded from clean, path: ${cleanPathInfo.path}.`);
                cleanTaskResult.excludedPaths.push(cleanPathInfo.path);
                continue;
            }

            // Exclude - if exclude file is in clean directory
            if (cleanPathInfo.isDirectory && excludePathInfoes.find((i) => isInFolder(cleanPathInfo.path, i.path))) {
                this.logger.debug(`Excluded from clean, path: ${cleanPathInfo.path}.`);
                cleanTaskResult.excludedPaths.push(cleanPathInfo.path);
                continue;
            }

            await this.delete(cleanPathInfo);

            cleanTaskResult.cleanedPathInfoes.push(cleanPathInfo);
        }

        return cleanTaskResult;
    }

    private validateCleanPath(cleanPathInfo: AbsolutePathInfo): void {
        const workspaceRoot = this.options.workspaceInfo.workspaceRoot;
        const outDir = this.options.outDir;

        if (cleanPathInfo.isSystemRoot) {
            throw new InvalidConfigError(
                `Deleting root directory is not permitted, path: ${cleanPathInfo.path}.`,
                this.configPath,
                `${this.configLocationPrefix}/clean`
            );
        }

        if (isSamePaths(cleanPathInfo.path, workspaceRoot)) {
            throw new InvalidConfigError(
                `Deleting current working directory is not permitted, path: ${cleanPathInfo.path}.`,
                this.configPath,
                `${this.configLocationPrefix}/clean`
            );
        }

        if (isInFolder(cleanPathInfo.path, workspaceRoot)) {
            throw new InvalidConfigError(
                `The path you specified to clean cannot be deleted because it contains the working directory., path: ${cleanPathInfo.path}.`,
                this.configPath,
                `${this.configLocationPrefix}/clean`
            );
        }

        if (!isSamePaths(outDir, cleanPathInfo.path) && !isInFolder(outDir, cleanPathInfo.path)) {
            throw new InvalidConfigError(
                `Deleting outside of the output directory is not allowed, path: ${cleanPathInfo.path}.`,
                this.configPath,
                `${this.configLocationPrefix}/clean`
            );
        }

        if (!isInFolder(workspaceRoot, cleanPathInfo.path)) {
            throw new InvalidConfigError(
                `Deleting outside of the workspace directory is not allowed, path: ${cleanPathInfo.path}/`,
                this.configPath,
                `${this.configLocationPrefix}/clean`
            );
        }
    }

    private async getCleanPathInfoes(): Promise<AbsolutePathInfo[]> {
        const cleanOptions = this.options.beforeOrAfterCleanOptions;
        const combinedCleanPaths = cleanOptions.paths ?? [];
        if (this.cleanOutDir) {
            // Must be relative path
            combinedCleanPaths.push('./');
        }

        if (!combinedCleanPaths.length) {
            return [];
        }

        const cleanPathInfoes = await getAbsolutePathInfoes(combinedCleanPaths, this.options.outDir);

        return cleanPathInfoes;
    }

    private async addAllFilesGlobMagicToCleanPathInfoes(
        cleanPathInfoes: AbsolutePathInfo[],
        excludePathInfoes: AbsolutePathInfo[]
    ): Promise<void> {
        const dirPathsToClean: string[] = [];
        for (const pathInfo of cleanPathInfoes) {
            if (pathInfo.isDirectory) {
                dirPathsToClean.push(pathInfo.path);
            }
        }
        const sortedDirPathsToClean = dirPathsToClean.sort((a, b) => b.length - a.length);
        const processedCleanDirs: string[] = [];
        const extraCleanDirPatterns: string[] = [];
        for (const dirPathToClean of sortedDirPathsToClean) {
            if (
                processedCleanDirs.find((p) => isInFolder(p, dirPathToClean)) ??
                !excludePathInfoes.find((i) => isInFolder(dirPathToClean, i.path))
            ) {
                continue;
            }

            processedCleanDirs.push(dirPathToClean);
            const relToOutDir = normalizePathToPOSIXStyle(path.relative(this.options.outDir, dirPathToClean));
            // Must be relative path
            extraCleanDirPatterns.push(`${relToOutDir}/**/*`);
        }

        const extraCleanPathInfoes = await getAbsolutePathInfoes(extraCleanDirPatterns, this.options.outDir);
        if (extraCleanPathInfoes.length) {
            cleanPathInfoes.push(...extraCleanPathInfoes);
        }
    }

    private getExcludePathInfoes(): Promise<AbsolutePathInfo[]> {
        const cleanOptions = this.options.beforeOrAfterCleanOptions;

        return getAbsolutePathInfoes(cleanOptions.exclude ?? [], this.options.outDir);
    }

    private async delete(cleanPathInfo: AbsolutePathInfo): Promise<void> {
        const cleanOutDir = isSamePaths(cleanPathInfo.path, this.options.outDir) ? true : false;

        const msgPrefix = cleanOutDir ? 'Deleting output directory' : 'Deleting';
        this.logger.info(`${msgPrefix} ${normalizePathToPOSIXStyle(path.relative(process.cwd(), cleanPathInfo.path))}`);

        if (!this.options.dryRun) {
            if (cleanPathInfo.isDirectory && !cleanPathInfo.isSymbolicLink) {
                await fs.rm(cleanPathInfo.path, {
                    recursive: true,
                    force: true,
                    maxRetries: 2,
                    retryDelay: 1000
                });
            } else {
                await fs.unlink(cleanPathInfo.path);
            }
        }
    }
}

export function getCleanTaskRunner(
    runFor: 'before' | 'after',
    context: BuildTaskHandleContext
): CleanTaskRunner | null {
    const buildTask = context.taskOptions;

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
            workspaceInfo: buildTask._workspaceInfo,
            outDir: buildTask._outDir,
            dryRun: context.dryRun,
            logger: context.logger
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
            workspaceInfo: buildTask._workspaceInfo,
            outDir: buildTask._outDir,
            dryRun: context.dryRun,
            logger: context.logger
        });

        return cleanTaskRunner;
    }

    return null;
}
