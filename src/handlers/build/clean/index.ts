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
        const outDir = this.options.outDir;
        const configLocationPrefix = `projects/${this.options.workspaceInfo.projectName ?? '0'}/tasks/build`;
        const configPath = this.options.workspaceInfo.configPath;

        if (!(await pathExists(outDir))) {
            return [];
        }

        const outDirStats = await fs.stat(outDir);
        if (outDirStats.isFile()) {
            throw new InvalidConfigError(
                `The 'outDir' must be directory.`,
                configPath,
                `${configLocationPrefix}/outDir`
            );
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
            await this.delete({
                path: outDir,
                isSystemRoot: false,
                isDirectory: true,
                isFile: false,
                isSymbolicLink: outDirStats.isSymbolicLink()
            });

            return [outDir];
        }

        // addMagicAllFilesToCleanPathInfoes
        await this.addAllFilesGlobMagicToCleanPathInfoes(cleanPathInfoes, excludePathInfoes);

        const cleanedPaths: string[] = [];

        for (const cleanPathInfo of cleanPathInfoes) {
            // Validation
            //
            if (cleanPathInfo.isSystemRoot) {
                throw new InvalidConfigError(
                    `Deleting root directory is not permitted, path: ${cleanPathInfo.path}.`,
                    configPath,
                    `${configLocationPrefix}/clean`
                );
            }

            if (isInFolder(cleanPathInfo.path, workspaceRoot) || isSamePaths(cleanPathInfo.path, workspaceRoot)) {
                throw new InvalidConfigError(
                    `Deleting current working directory is not permitted, path: ${cleanPathInfo.path}.`,
                    configPath,
                    `${configLocationPrefix}/clean`
                );
            }

            if (!isInFolder(workspaceRoot, cleanPathInfo.path)) {
                throw new InvalidConfigError(
                    `Deleting outside of current working directory is disabled. Path: ${cleanPathInfo.path}/`,
                    configPath,
                    `${configLocationPrefix}/clean`
                );
            }

            if (!isSamePaths(outDir, cleanPathInfo.path) && !isInFolder(outDir, cleanPathInfo.path)) {
                throw new InvalidConfigError(
                    `Cleaning outside of the output directory is disabled. Path: ${cleanPathInfo.path}.`,
                    configPath,
                    `${configLocationPrefix}/clean`
                );
            }

            // If already cleaned
            if (
                cleanedPaths.includes(cleanPathInfo.path) ||
                cleanedPaths.find((p) => isSamePaths(p, cleanPathInfo.path))
            ) {
                continue;
            }

            // Exclude - if clean file is same as exclude file or directory
            if (excludePathInfoes.find((i) => isSamePaths(i.path, cleanPathInfo.path))) {
                this.logger.debug(`Excluded from clean, path: ${cleanPathInfo.path}.`);
                continue;
            }

            // Exclude - if clean file/directory is in exclude directory
            if (excludePathInfoes.find((i) => i.isDirectory && isInFolder(i.path, cleanPathInfo.path))) {
                this.logger.debug(`Excluded from clean, path: ${cleanPathInfo.path}.`);
                continue;
            }

            // Exclude - if exclude file is in clean directory
            if (cleanPathInfo.isDirectory && excludePathInfoes.find((i) => isInFolder(cleanPathInfo.path, i.path))) {
                this.logger.debug(`Excluded from clean, path: ${cleanPathInfo.path}.`);
                continue;
            }

            await this.delete(cleanPathInfo);

            cleanedPaths.push(cleanPathInfo.path);
        }

        return cleanedPaths;
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
        const relToWorkspace = normalizePathToPOSIXStyle(
            path.relative(this.options.workspaceInfo.workspaceRoot, cleanPathInfo.path)
        );

        const msgPrefix = cleanOutDir ? 'Deleting output directory' : 'Deleting';
        this.logger.info(`${msgPrefix} ${relToWorkspace}`);

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
