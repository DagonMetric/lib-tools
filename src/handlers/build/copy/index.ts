import { glob } from 'glob';
import { minimatch } from 'minimatch';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ParsedBuildTask, WorkspaceInfo } from '../../../helpers/index.js';
import { CopyEntry } from '../../../models/index.js';
import { Logger, isSamePaths, normalizePath, pathExists } from '../../../utils/index.js';

function excludeMatch(filePathRel: string, excludes: string[]): boolean {
    let il = excludes.length;
    while (il--) {
        const ignoreGlob = excludes[il];
        if (minimatch(filePathRel, ignoreGlob, { dot: true, matchBase: true })) {
            return true;
        }
    }

    return false;
}

export interface CopyTaskRunnerOptions {
    logger: Logger;
    copyEntries: CopyEntry[];
    workspaceInfo: WorkspaceInfo;
    outDir: string;
    dryRun: boolean;
}

export class CopyTaskRunner {
    private readonly logger: Logger;

    constructor(readonly options: CopyTaskRunnerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<string[]> {
        if (!this.options.copyEntries?.length) {
            return [];
        }

        const copyEntries = this.options.copyEntries;
        const projectRoot = this.options.workspaceInfo.projectRoot;
        const outDir = this.options.outDir;
        const copiedPaths: string[] = [];

        for (const copyEntry of copyEntries) {
            const excludes = copyEntry.exclude ?? ['**/.DS_Store', '**/Thumbs.db'];
            const toPath = path.resolve(outDir, copyEntry.to ?? '');
            const hasMagic = glob.hasMagic(copyEntry.from);

            if (hasMagic) {
                let foundPaths = await glob(copyEntry.from, {
                    cwd: projectRoot,
                    nodir: true,
                    dot: true
                });

                foundPaths = foundPaths.filter((p) => !excludeMatch(normalizePath(p), excludes));

                if (!foundPaths.length) {
                    this.logger.warn(`There is no matched file to copy, pattern: ${copyEntry.from}`);
                    continue;
                }

                let fromRoot = projectRoot;
                const parts = normalizePath(copyEntry.from).split('/');
                for (const p of parts) {
                    if (await pathExists(path.resolve(fromRoot, p))) {
                        fromRoot = path.resolve(fromRoot, p);
                    } else {
                        break;
                    }
                }

                await Promise.all(
                    foundPaths.map(async (foundFileRel) => {
                        const fromFilePath = path.resolve(projectRoot, foundFileRel);
                        const toFileRel = path.relative(fromRoot, fromFilePath);
                        const toFilePath = path.resolve(toPath, toFileRel);

                        this.logger.debug(`Copying ${normalizePath(foundFileRel)} file`);

                        if (!this.options.dryRun) {
                            if (!(await pathExists(path.dirname(toFilePath)))) {
                                await fs.mkdir(path.dirname(toFilePath), {
                                    mode: 0o777,
                                    recursive: true
                                });
                            }

                            await fs.copyFile(fromFilePath, toFilePath);
                        }

                        if (!copiedPaths.includes(toFilePath)) {
                            copiedPaths.push(toFilePath);
                        }
                    })
                );
            } else {
                const fromPath = path.isAbsolute(copyEntry.from)
                    ? path.resolve(copyEntry.from)
                    : path.resolve(projectRoot, copyEntry.from);
                if (!(await pathExists(fromPath))) {
                    this.logger.warn(`Path doesn't exist to copy, path: ${fromPath}`);
                    continue;
                }

                const stats = await fs.stat(fromPath);
                if (stats.isFile()) {
                    const fromPathRel = normalizePath(path.relative(projectRoot, fromPath));
                    if (excludeMatch(fromPathRel, excludes)) {
                        this.logger.warn(`Excluded from copy, path: ${fromPath}`);
                        continue;
                    }

                    const fromExt = path.extname(fromPath);
                    const toExt = path.extname(toPath);
                    let toFilePath = toPath;
                    if (
                        !copyEntry.to ||
                        copyEntry.to.endsWith('/') ||
                        isSamePaths(outDir, toPath) ||
                        (fromExt && !toExt)
                    ) {
                        toFilePath = path.resolve(toPath, path.basename(fromPath));
                    }

                    this.logger.debug(`Copying ${fromPathRel} file`);

                    if (!this.options.dryRun) {
                        if (!(await pathExists(path.dirname(toFilePath)))) {
                            await fs.mkdir(path.dirname(toFilePath), {
                                mode: 0o777,
                                recursive: true
                            });
                        }

                        await fs.copyFile(fromPath, toFilePath);
                    }

                    if (!copiedPaths.includes(toFilePath)) {
                        copiedPaths.push(toFilePath);
                    }
                } else {
                    let foundPaths = await glob('**/*', {
                        cwd: fromPath,
                        nodir: true,
                        dot: true
                    });

                    foundPaths = foundPaths.filter((p) => !excludeMatch(normalizePath(p), excludes));

                    if (!foundPaths.length) {
                        this.logger.warn(`There is no matched file to copy, path: ${fromPath}`);
                        continue;
                    }

                    await Promise.all(
                        foundPaths.map(async (foundFileRel) => {
                            const toFilePath = path.resolve(toPath, foundFileRel);
                            const foundFromFilePath = path.resolve(fromPath, foundFileRel);

                            this.logger.debug(
                                `Copying ${normalizePath(path.relative(projectRoot, foundFromFilePath))} file`
                            );

                            if (!this.options.dryRun) {
                                if (!(await pathExists(path.dirname(toFilePath)))) {
                                    await fs.mkdir(path.dirname(toFilePath), {
                                        mode: 0o777,
                                        recursive: true
                                    });
                                }

                                await fs.copyFile(foundFromFilePath, toFilePath);
                            }

                            if (!copiedPaths.includes(toFilePath)) {
                                copiedPaths.push(toFilePath);
                            }
                        })
                    );
                }
            }
        }

        return copiedPaths;
    }
}

export function getCopyTaskRunner(buildTask: ParsedBuildTask, logger: Logger, dryRun: boolean): CopyTaskRunner | null {
    if (!buildTask.copy?.length) {
        return null;
    }

    const copyEntries = buildTask.copy.map((copyEntry) =>
        typeof copyEntry === 'string' ? { from: copyEntry } : { ...copyEntry }
    );

    const copyTaskRunner = new CopyTaskRunner({
        copyEntries,
        dryRun,
        workspaceInfo: buildTask._workspaceInfo,
        outDir: buildTask._outDir,
        logger
    });

    return copyTaskRunner;
}