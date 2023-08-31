import { glob } from 'glob';
import { minimatch } from 'minimatch';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidConfigError } from '../../../exceptions/index.js';
import { WorkspaceInfo } from '../../../helpers/index.js';
import { AfterBuildCleanOptions, BeforeBuildCleanOptions } from '../../../models/index.js';
import { Logger, isInFolder, isSamePaths, normalizePath, pathExists } from '../../../utils/index.js';

export interface CleanTaskHandlerOptions {
    workspaceInfo: WorkspaceInfo;
    beforeOrAfterCleanOptions: BeforeBuildCleanOptions | AfterBuildCleanOptions;
    forBeforeBuildClean: boolean;
    outDir: string;
    allowOutsideWorkspaceRoot: boolean;
    allowOutsideOutDir: boolean;
    logger: Logger;
}

export class CleanTaskHandler {
    private readonly logger: Logger;
    private cleaned = false;

    constructor(private readonly options: CleanTaskHandlerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<void> {
        if (this.cleaned || !this.options.beforeOrAfterCleanOptions) {
            return;
        }

        await this.cleanInternal();
    }

    private async cleanInternal(): Promise<void> {
        const cleanOptions = this.options.beforeOrAfterCleanOptions;
        const workspaceRoot = this.options.workspaceInfo.workspaceRoot;
        const outDir = this.options.outDir;
        const forBeforeBuildClean = this.options.forBeforeBuildClean;
        const rawPathsToClean: string[] = [];

        if (forBeforeBuildClean) {
            const beforeBuildCleanOptions = cleanOptions as BeforeBuildCleanOptions;
            if (
                !beforeBuildCleanOptions.cleanOutDir &&
                (!beforeBuildCleanOptions.paths ||
                    (beforeBuildCleanOptions.paths && !beforeBuildCleanOptions.paths.length))
            ) {
                this.cleaned = true;

                return;
            }

            if (beforeBuildCleanOptions.cleanOutDir) {
                rawPathsToClean.push(outDir);
                rawPathsToClean.push('**/*');
            }
        } else {
            const afterBuildCleanOptions = cleanOptions as AfterBuildCleanOptions;
            if (
                !afterBuildCleanOptions.paths ||
                (afterBuildCleanOptions.paths && !afterBuildCleanOptions.paths.length)
            ) {
                this.cleaned = true;

                return;
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
            cleanOptions.exclude.forEach((excludePath) => {
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
            });
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

        const pathsToClean: string[] = [];

        await Promise.all(
            rawPathsToClean.map(async (cleanPattern: string) => {
                if (!glob.hasMagic(cleanPattern)) {
                    const absolutePath = path.isAbsolute(cleanPattern)
                        ? path.resolve(cleanPattern)
                        : path.resolve(outDir, cleanPattern);

                    if (!pathsToClean.includes(absolutePath)) {
                        pathsToClean.push(absolutePath);
                    }
                } else {
                    const foundPaths = await glob(cleanPattern, { cwd: outDir, dot: true });
                    foundPaths.forEach((p) => {
                        const absolutePath = path.isAbsolute(p) ? path.resolve(p) : path.resolve(outDir, p);
                        if (!pathsToClean.includes(absolutePath)) {
                            pathsToClean.push(absolutePath);
                        }
                    });
                }
            })
        );

        for (const pathToClean of pathsToClean) {
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

                const configLocation = `projects[${this.options.workspaceInfo.projectName ?? '0'}].tasks.build.clean`;
                if (isSamePaths(path.parse(pathToClean).root, pathToClean)) {
                    throw new InvalidConfigError(
                        `Deleting root directory is not permitted, path: ${pathToClean}.`,
                        configLocation
                    );
                }

                if (isInFolder(pathToClean, workspaceRoot) || isSamePaths(pathToClean, workspaceRoot)) {
                    throw new InvalidConfigError(
                        `Deleting current working directory is not permitted, path: ${pathToClean}.`,
                        configLocation
                    );
                }

                if (!isInFolder(workspaceRoot, pathToClean) && this.options.allowOutsideWorkspaceRoot === false) {
                    throw new InvalidConfigError(
                        `Deleting outside of current working root directory is disabled. To enable cleaning, set 'allowOutsideWorkspaceRoot' to 'true' in clean option.`,
                        configLocation
                    );
                }

                if (
                    (!isInFolder(outDir, pathToClean) || isSamePaths(outDir, pathToClean)) &&
                    !this.options.allowOutsideOutDir
                ) {
                    throw new InvalidConfigError(
                        `Cleaning outside of the output directory is disabled. To enable cleaning, set 'allowOutsideOutDir' to 'true' in clean option.`,
                        configLocation
                    );
                }
            }

            const exists = await pathExists(pathToClean);
            if (exists) {
                const relToWorkspace = normalizePath(path.relative(workspaceRoot, pathToClean));
                const msgPrefix = cleanOutDir ? 'Deleting output directory' : 'Deleting';
                this.logger.info(`${msgPrefix} ${relToWorkspace}`);

                await fs.unlink(pathToClean);
            }
        }
    }
}
