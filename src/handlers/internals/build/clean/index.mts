/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { AfterBuildCleanOptions, BeforeBuildCleanOptions, CleanOptions } from '../../../../config-models/index.mjs';
import {
    AbsolutePathInfo,
    LogLevelStrings,
    LoggerBase,
    colors,
    getAbsolutePathInfoes,
    isInFolder,
    isSamePath,
    normalizePathToPOSIXStyle,
    pathExists
} from '../../../../utils/index.mjs';

import { BuildTask } from '../../../build-task.mjs';
import { InvalidConfigError } from '../../../exceptions/index.mjs';
import { HandlerOptions } from '../../../handler-options.mjs';

export interface CleanTaskRunnerOptions {
    readonly runFor: 'before' | 'after';
    readonly beforeOrAfterCleanOptions: Readonly<BeforeBuildCleanOptions> | Readonly<AfterBuildCleanOptions>;
    readonly outDir: string;
    readonly buildTask: Readonly<BuildTask>;
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings;
    readonly dryRun: boolean;
    readonly env: string | undefined;
}

export interface CleanTaskResult {
    readonly cleanedPathInfoes: AbsolutePathInfo[];
    readonly excludedPaths: string[];
}

export class CleanTaskRunner {
    private readonly logger: LoggerBase;
    private readonly cleanOutDir: boolean;
    private readonly configLocationPrefix: string;
    private readonly configPath: string | null | undefined;
    private startTime = Date.now();

    constructor(readonly options: Readonly<CleanTaskRunnerOptions>) {
        this.logger = options.logger;
        this.cleanOutDir =
            this.options.runFor === 'before' &&
            (this.options.beforeOrAfterCleanOptions as BeforeBuildCleanOptions).cleanOutDir
                ? true
                : false;

        this.configPath = this.options.buildTask.configPath;

        const taskLocation = `tasks/${this.options.buildTask.taskName}`;
        this.configLocationPrefix = this.options.buildTask.projectName
            ? `projects/${this.options.buildTask.projectName}/${taskLocation}`
            : taskLocation;
    }

    async run(): Promise<CleanTaskResult> {
        this.logStart();

        const outDir = this.options.outDir;

        const cleanTaskResult: CleanTaskResult = {
            cleanedPathInfoes: [],
            excludedPaths: []
        };

        if (!(await pathExists(outDir))) {
            this.logComplete(cleanTaskResult);

            return cleanTaskResult;
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
            this.logComplete(cleanTaskResult);

            return cleanTaskResult;
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

            cleanTaskResult.cleanedPathInfoes.push(outDirPathInfo);

            this.logComplete(cleanTaskResult);

            return cleanTaskResult;
        }

        // addAllFilesGlobMagicToCleanPathInfoes
        await this.addAllFilesGlobMagicToCleanPathInfoes(cleanPathInfoes, excludePathInfoes);

        for (const cleanPathInfo of cleanPathInfoes) {
            // Validation
            this.validateCleanPath(cleanPathInfo);

            // If already cleaned
            if (cleanTaskResult.cleanedPathInfoes.some((pathInfo) => isSamePath(pathInfo.path, cleanPathInfo.path))) {
                continue;
            }

            // If already excluded
            if (cleanTaskResult.excludedPaths.some((p) => isSamePath(p, cleanPathInfo.path))) {
                continue;
            }

            // Exclude - if clean file is same as exclude file or directory
            if (excludePathInfoes.some((i) => isSamePath(i.path, cleanPathInfo.path))) {
                this.logger.debug(`Excluded from clean, path: ${cleanPathInfo.path}.`);
                cleanTaskResult.excludedPaths.push(cleanPathInfo.path);
                continue;
            }

            // Exclude - if clean file/directory is in exclude directory
            if (excludePathInfoes.some((i) => i.isDirectory && isInFolder(i.path, cleanPathInfo.path))) {
                this.logger.debug(`Excluded from clean, path: ${cleanPathInfo.path}.`);
                cleanTaskResult.excludedPaths.push(cleanPathInfo.path);
                continue;
            }

            // Exclude - if exclude file is in clean directory
            if (cleanPathInfo.isDirectory && excludePathInfoes.some((i) => isInFolder(cleanPathInfo.path, i.path))) {
                this.logger.debug(`Excluded from clean, path: ${cleanPathInfo.path}.`);
                cleanTaskResult.excludedPaths.push(cleanPathInfo.path);
                continue;
            }

            await this.delete(cleanPathInfo);

            cleanTaskResult.cleanedPathInfoes.push(cleanPathInfo);
        }

        this.logComplete(cleanTaskResult);

        return cleanTaskResult;
    }

    private validateCleanPath(cleanPathInfo: AbsolutePathInfo): void {
        const workspaceRoot = this.options.buildTask.workspaceRoot;
        const outDir = this.options.outDir;

        if (cleanPathInfo.isSystemRoot) {
            throw new InvalidConfigError(
                `Deleting root directory is not permitted, path: ${cleanPathInfo.path}.`,
                this.configPath,
                `${this.configLocationPrefix}/clean`
            );
        }

        if (isSamePath(cleanPathInfo.path, workspaceRoot)) {
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

        if (!isSamePath(outDir, cleanPathInfo.path) && !isInFolder(outDir, cleanPathInfo.path)) {
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
                processedCleanDirs.some((p) => isSamePath(p, dirPathToClean) || isInFolder(p, dirPathToClean)) ||
                !excludePathInfoes.some((i) => isSamePath(dirPathToClean, i.path) || isInFolder(dirPathToClean, i.path))
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

    private logStart(): void {
        this.logger.group('\u25B7 clean');
        this.startTime = Date.now();
    }

    private logComplete(result: CleanTaskResult): void {
        const cleanedDirsCount = result.cleanedPathInfoes.filter((pathInfo) => pathInfo.isDirectory).length;
        const cleanedFilesCount = result.cleanedPathInfoes.filter((pathInfo) => pathInfo.isFile).length;
        const fileSuffix = cleanedFilesCount > 1 ? 'files' : 'file';
        const dirSuffix = cleanedDirsCount > 1 ? 'directories' : 'directory';
        let cleanMsg = `otal ${cleanedFilesCount} ${fileSuffix} and ${cleanedDirsCount} ${dirSuffix} cleaned`;
        if (result.excludedPaths.length) {
            cleanMsg += `, ${result.excludedPaths.length} excluded`;
        }
        cleanMsg += '.';
        this.logger.info(cleanMsg);
        this.logger.groupEnd();
        this.logger.info(
            `${colors.lightGreen('\u25B6')} clean [${colors.lightGreen(`${Date.now() - this.startTime} ms`)}]`
        );
    }

    private async delete(cleanPathInfo: AbsolutePathInfo): Promise<void> {
        const cleanOutDir = isSamePath(cleanPathInfo.path, this.options.outDir) ? true : false;

        const msgPrefix = cleanOutDir ? 'Deleting output directory' : 'Deleting';
        this.logger.info(`${msgPrefix} ${normalizePathToPOSIXStyle(path.relative(process.cwd(), cleanPathInfo.path))}`);

        if (!this.options.dryRun) {
            await fs.rm(cleanPathInfo.path, {
                recursive: true,
                force: true
                // maxRetries: 2,
                // retryDelay: 1000
            });
        } else {
            this.logger.debug('Actual deleting is not performed because the dryRun parameter is passed.');
        }
    }
}

export function getCleanTaskRunner(
    runFor: 'before' | 'after',
    buildTask: Readonly<BuildTask>,
    options: Readonly<HandlerOptions>
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
            outDir: buildTask.outDir,
            buildTask,
            logger: options.logger,
            logLevel: options.logLevel,
            dryRun: options.dryRun,
            env: options.env
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
            outDir: buildTask.outDir,
            buildTask,
            logger: options.logger,
            logLevel: options.logLevel,
            dryRun: options.dryRun,
            env: options.env
        });

        return cleanTaskRunner;
    }

    return null;
}
