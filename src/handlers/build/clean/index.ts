import { glob } from 'glob';
import { minimatch } from 'minimatch';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidConfigError } from '../../../exceptions/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../../../helpers/index.js';
import { AfterBuildCleanOptions, BeforeBuildCleanOptions, CleanOptions } from '../../../models/index.js';
import { Logger, isInFolder, isSamePaths, normalizePath, pathExists } from '../../../utils/index.js';

export interface CleanTaskRunnerOptions {
    runFor: 'before' | 'after';
    beforeOrAfterCleanOptions: BeforeBuildCleanOptions | AfterBuildCleanOptions;
    dryRun: boolean;
    workspaceInfo: WorkspaceInfo;
    outDir: string;
    allowOutsideWorkspaceRoot: boolean;
    allowOutsideOutDir: boolean;
    logger: Logger;
}

export class CleanTaskRunner {
    private readonly logger: Logger;

    constructor(readonly options: CleanTaskRunnerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<string[]> {
        const cleanedPaths: string[] = [];

        const cleanOptions = this.options.beforeOrAfterCleanOptions;
        const workspaceRoot = this.options.workspaceInfo.workspaceRoot;
        const projectRoot = this.options.workspaceInfo.projectRoot;
        const outDir = this.options.outDir;
        const rawPathsToClean: string[] = [];

        const configLocationPrefix = `projects[${this.options.workspaceInfo.projectName ?? '0'}].tasks.build`;

        // Validation
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

        if (this.options.runFor === 'before') {
            const beforeBuildCleanOptions = cleanOptions as BeforeBuildCleanOptions;
            if (
                !beforeBuildCleanOptions.cleanOutDir &&
                (!beforeBuildCleanOptions.paths ||
                    (beforeBuildCleanOptions.paths && !beforeBuildCleanOptions.paths.length))
            ) {
                return [];
            }

            if (beforeBuildCleanOptions.cleanOutDir) {
                rawPathsToClean.push(outDir);
                if (beforeBuildCleanOptions.paths?.length ?? beforeBuildCleanOptions.exclude?.length) {
                    rawPathsToClean.push('**/*');
                }
            }
        } else {
            const afterBuildCleanOptions = cleanOptions as AfterBuildCleanOptions;
            if (
                !afterBuildCleanOptions.paths ||
                (afterBuildCleanOptions.paths && !afterBuildCleanOptions.paths.length)
            ) {
                return [];
            }
        }

        if (cleanOptions.paths?.length) {
            cleanOptions.paths.forEach((p) => {
                rawPathsToClean.push(p);
            });
        }

        // calculate excludes
        const patternsToExclude: string[] = [];
        const pathsToExclude: string[] = [];
        const existedFilesToExclude: string[] = [];
        const existedDirsToExclude: string[] = [];

        if (cleanOptions.exclude) {
            for (const excludePath of cleanOptions.exclude) {
                if (glob.hasMagic(excludePath)) {
                    if (!patternsToExclude.includes(excludePath)) {
                        patternsToExclude.push(excludePath);
                    }
                } else {
                    const absPath = path.isAbsolute(excludePath)
                        ? path.resolve(excludePath)
                        : path.resolve(outDir, excludePath);
                    if (!pathsToExclude.includes(absPath)) {
                        pathsToExclude.push(absPath);
                    }
                }
            }
        }

        if (pathsToExclude.length > 0) {
            await Promise.all(
                pathsToExclude.map(async (excludePath: string) => {
                    const isExists = await pathExists(excludePath);
                    if (isExists) {
                        const statInfo = await fs.stat(excludePath);
                        if (statInfo.isDirectory()) {
                            if (!existedDirsToExclude.includes(excludePath)) {
                                existedDirsToExclude.push(excludePath);
                            }
                        } else {
                            if (!existedFilesToExclude.includes(excludePath)) {
                                existedFilesToExclude.push(excludePath);
                            }
                        }
                    }
                })
            );
        }

        if (patternsToExclude.length > 0) {
            await Promise.all(
                patternsToExclude.map(async (excludePattern: string) => {
                    const foundExcludePaths = await glob(excludePattern, {
                        cwd: outDir,
                        dot: true,
                        absolute: true
                    });
                    for (const p of foundExcludePaths) {
                        const absPath = path.isAbsolute(p) ? path.resolve(p) : path.resolve(outDir, p);
                        const statInfo = await fs.stat(absPath);
                        if (statInfo.isDirectory()) {
                            if (!existedDirsToExclude.includes(absPath)) {
                                existedDirsToExclude.push(absPath);
                            }
                        } else {
                            if (!existedFilesToExclude.includes(absPath)) {
                                existedFilesToExclude.push(absPath);
                            }
                        }
                    }
                })
            );
        }

        const realPathsToClean: string[] = [];

        await Promise.all(
            rawPathsToClean.map(async (cleanPattern: string) => {
                if (!glob.hasMagic(cleanPattern)) {
                    const absolutePath = path.isAbsolute(cleanPattern)
                        ? path.resolve(cleanPattern)
                        : path.resolve(outDir, cleanPattern);

                    if (!realPathsToClean.includes(absolutePath)) {
                        realPathsToClean.push(absolutePath);
                    }
                } else {
                    const foundPaths = await glob(cleanPattern, { cwd: outDir, dot: true });
                    foundPaths.forEach((p) => {
                        const absolutePath = path.isAbsolute(p) ? path.resolve(p) : path.resolve(outDir, p);
                        if (!realPathsToClean.includes(absolutePath)) {
                            realPathsToClean.push(absolutePath);
                        }
                    });
                }
            })
        );

        for (const pathToClean of realPathsToClean) {
            if (
                existedFilesToExclude.includes(pathToClean) ||
                existedDirsToExclude.includes(pathToClean) ||
                pathsToExclude.includes(pathToClean) ||
                existedDirsToExclude.find((e) => isInFolder(e, pathToClean))
            ) {
                continue;
            }

            const relToOutDir = normalizePath(path.relative(outDir, pathToClean));

            if (relToOutDir) {
                let il = patternsToExclude.length;
                let foundExclude = false;
                while (il--) {
                    const ignoreGlob = patternsToExclude[il];
                    if (minimatch(relToOutDir, ignoreGlob, { dot: true, matchBase: true })) {
                        foundExclude = true;
                        break;
                    }
                }

                if (foundExclude) {
                    continue;
                }
            }

            if (
                path.extname(pathToClean) === '' &&
                (existedFilesToExclude.find((e) => isInFolder(pathToClean, e)) ??
                    existedDirsToExclude.find((e) => isInFolder(pathToClean, e)))
            ) {
                continue;
            }

            let cleanOutDir = true;

            // validation
            if (!isSamePaths(pathToClean, outDir)) {
                cleanOutDir = false;

                if (isSamePaths(path.parse(pathToClean).root, pathToClean)) {
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

                if (!isInFolder(workspaceRoot, pathToClean) && this.options.allowOutsideWorkspaceRoot === false) {
                    throw new InvalidConfigError(
                        `Deleting outside of current working directory is disabled. To enable it, set 'allowOutsideWorkspaceRoot' to 'true' in clean option.`,
                        `${configLocationPrefix}.clean`
                    );
                }

                if (
                    (!isInFolder(outDir, pathToClean) || isSamePaths(outDir, pathToClean)) &&
                    !this.options.allowOutsideOutDir
                ) {
                    throw new InvalidConfigError(
                        `Cleaning outside of the output directory is disabled. To enable it, set 'allowOutsideOutDir' to 'true' in clean option.`,
                        `${configLocationPrefix}.clean`
                    );
                }
            }

            const exists = await pathExists(pathToClean);
            if (exists) {
                const relToWorkspace = normalizePath(path.relative(workspaceRoot, pathToClean));
                const msgPrefix = cleanOutDir ? 'Deleting output directory' : 'Deleting';
                this.logger.info(`${msgPrefix} ${relToWorkspace}`);

                if (!this.options.dryRun) {
                    await fs.unlink(pathToClean);
                }

                cleanedPaths.push(pathToClean);
            }
        }

        return cleanedPaths;
    }
}

export function getCleanTaskRunner(
    buildTask: ParsedBuildTask,
    logger: Logger,
    runFor: 'before' | 'after',
    dryRun: boolean
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
            allowOutsideWorkspaceRoot: cleanOptions.allowOutsideWorkspaceRoot ? true : false,
            allowOutsideOutDir: cleanOptions.allowOutsideOutDir ? true : false,
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
            allowOutsideWorkspaceRoot: cleanOptions.allowOutsideWorkspaceRoot ? true : false,
            allowOutsideOutDir: cleanOptions.allowOutsideOutDir ? true : false,
            logger
        });

        return cleanTaskRunner;
    }

    return null;
}
