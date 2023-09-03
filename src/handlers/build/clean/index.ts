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
    readonly isSystemRoot: boolean;
    readonly stats: Stats | null;
}

async function getPathInfoes(paths: string[], outDir: string): Promise<PathInfo[]> {
    if (!paths?.length) {
        return [];
    }

    const pathInfoes: PathInfo[] = [];
    const processedPaths: string[] = [];

    for (let pathOrPattern of paths) {
        if (!pathOrPattern?.trim().length) {
            continue;
        }

        pathOrPattern = normalizePathToPOSIXStyle(pathOrPattern);

        if (!pathOrPattern) {
            continue;
        }

        if (glob.hasMagic(pathOrPattern)) {
            const foundPaths = await glob(pathOrPattern, { cwd: outDir, dot: true, absolute: true });
            for (const absolutePath of foundPaths) {
                if (!processedPaths.includes(absolutePath)) {
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
            }
        } else {
            const absolutePath = isWindowsStyleAbsolute(pathOrPattern)
                ? path.resolve(normalizePathToPOSIXStyle(pathOrPattern))
                : path.resolve(outDir, normalizePathToPOSIXStyle(pathOrPattern));
            if (!processedPaths.includes(absolutePath)) {
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
        const combinedPaths: string[] = [];
        if (cleanOutDir) {
            combinedPaths.push(outDir);
            if (cleanOptions.exclude?.length) {
                combinedPaths.push('**/*');
            }
        }
        combinedPaths.push(...(cleanOptions.paths ?? []));

        if (!combinedPaths.length) {
            return [];
        }

        const cleanPathInfoes = await getPathInfoes(combinedPaths, outDir);

        const excludePathInfoes = await getPathInfoes(cleanOptions.exclude ?? [], outDir);

        if (cleanOutDir && !excludePathInfoes.length) {
            await this.delete({ absolutePath: outDir, stats: outDirStats, isSystemRoot: false });

            return [outDir];
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
