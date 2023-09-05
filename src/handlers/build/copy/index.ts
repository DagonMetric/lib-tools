import { glob } from 'glob';
import { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidConfigError } from '../../../exceptions/index.js';
import { CopyEntry } from '../../../models/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../../../models/parsed/index.js';
import {
    Logger,
    isInFolder,
    isSamePaths,
    isWindowsStyleAbsolute,
    normalizePathToPOSIXStyle,
    pathExists
} from '../../../utils/index.js';

export interface CopyTaskRunnerOptions {
    readonly logger: Logger;
    readonly copyEntries: CopyEntry[];
    readonly workspaceInfo: WorkspaceInfo;
    readonly outDir: string;
    readonly dryRun: boolean;
}

interface CopyPathInfo {
    fromPath: string;
    toPath: string;
}

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

export class CopyTaskRunner {
    private readonly logger: Logger;

    constructor(readonly options: CopyTaskRunnerOptions) {
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

        const copyPathInfoes = await this.getCopyPathInfoes();

        await this.copy(copyPathInfoes);

        return copyPathInfoes.map((i) => i.toPath);
    }

    private async getCopyPathInfoes(): Promise<CopyPathInfo[]> {
        const copyPathInfoes: CopyPathInfo[] = [];

        const copyEntries = this.options.copyEntries;
        const outDir = this.options.outDir;
        const projectRoot = this.options.workspaceInfo.projectRoot;

        const processedFroms: string[] = [];

        for (const copyEntry of copyEntries) {
            let normalizedFrom = normalizePathToPOSIXStyle(copyEntry.from);

            if (!normalizedFrom && /^[./\\]/.test(normalizedFrom)) {
                normalizedFrom = './';
            }

            if (!normalizedFrom) {
                continue;
            }

            if (processedFroms.includes(normalizedFrom)) {
                continue;
            }
            processedFroms.push(normalizedFrom);

            const excludePathInfoes = await getPathInfoes(copyEntry.exclude ?? [], projectRoot);

            if (glob.hasMagic(normalizedFrom)) {
                const foundPaths = await glob(normalizedFrom, {
                    cwd: projectRoot,
                    nodir: true,
                    dot: true,
                    absolute: true
                });

                if (!foundPaths.length) {
                    this.logger.warn(`There is no matched file to copy, pattern: ${copyEntry.from}`);
                    continue;
                }

                let fromBasePath = projectRoot;
                const parts = normalizedFrom.split('/');
                for (const p of parts) {
                    const testPath = path.resolve(fromBasePath, p);
                    if (await pathExists(testPath)) {
                        fromBasePath = testPath;
                    } else {
                        break;
                    }
                }

                const toBasePath =
                    copyEntry.to && isWindowsStyleAbsolute(copyEntry.to) && process.platform === 'win32'
                        ? path.resolve(normalizePathToPOSIXStyle(copyEntry.to))
                        : path.resolve(outDir, normalizePathToPOSIXStyle(copyEntry.to ?? ''));

                for (const fromPath of foundPaths) {
                    if (copyPathInfoes.find((f) => f.fromPath === fromPath)) {
                        continue;
                    }

                    if (excludePathInfoes.length) {
                        const fromPathStats = await fs.stat(fromPath);
                        if (this.isExclude(fromPath, fromPathStats, excludePathInfoes)) {
                            this.logger.debug(`Excluded from copy, path: ${fromPath}.`);
                            continue;
                        }
                    }

                    const toPathRel = path.relative(fromBasePath, fromPath);
                    const toPath = path.resolve(toBasePath, toPathRel);

                    copyPathInfoes.push({
                        fromPath,
                        toPath
                    });
                }
            } else {
                const fromPath =
                    isWindowsStyleAbsolute(normalizedFrom) && process.platform === 'win32'
                        ? path.resolve(normalizedFrom)
                        : path.resolve(projectRoot, normalizedFrom);

                if (copyPathInfoes.find((f) => f.fromPath === fromPath)) {
                    continue;
                }

                if (!(await pathExists(fromPath))) {
                    this.logger.warn(`Path doesn't exist to copy, path: ${fromPath}`);
                    continue;
                }

                const toBasePath =
                    copyEntry.to && isWindowsStyleAbsolute(copyEntry.to) && process.platform === 'win32'
                        ? path.resolve(normalizePathToPOSIXStyle(copyEntry.to))
                        : path.resolve(outDir, normalizePathToPOSIXStyle(copyEntry.to ?? ''));

                const fromPathStats = await fs.stat(fromPath);
                if (excludePathInfoes.length) {
                    if (this.isExclude(fromPath, fromPathStats, excludePathInfoes)) {
                        this.logger.debug(`Excluded from copy, path: ${fromPath}.`);
                        continue;
                    }
                }

                if (fromPathStats.isFile()) {
                    const fromExt = path.extname(fromPath);
                    const toExt = path.extname(toBasePath);
                    let toPath = toBasePath;
                    if (
                        !copyEntry.to?.trim().length ||
                        copyEntry.to.trim().endsWith('/') ||
                        isSamePaths(outDir, toBasePath) ||
                        (fromExt && !toExt)
                    ) {
                        toPath = path.resolve(toBasePath, path.basename(fromPath));
                    }

                    copyPathInfoes.push({
                        fromPath,
                        toPath
                    });
                } else {
                    const foundPaths = await glob('**/*', {
                        cwd: fromPath,
                        // TODO: To review
                        nodir: true,
                        dot: true,
                        absolute: true
                    });

                    if (!foundPaths.length) {
                        continue;
                    }

                    for (const foundFromPath of foundPaths) {
                        if (copyPathInfoes.find((f) => f.fromPath === foundFromPath)) {
                            continue;
                        }

                        if (excludePathInfoes.length) {
                            const foundFromPathStats = await fs.stat(foundFromPath);

                            if (this.isExclude(foundFromPath, foundFromPathStats, excludePathInfoes)) {
                                this.logger.debug(`Excluded from copy, path: ${foundFromPath}.`);
                                continue;
                            }
                        }

                        const foundFromPathRel = normalizePathToPOSIXStyle(path.relative(fromPath, foundFromPath));
                        const toPath = path.resolve(toBasePath, foundFromPathRel);

                        copyPathInfoes.push({
                            fromPath: foundFromPath,
                            toPath
                        });
                    }
                }
            }
        }

        return copyPathInfoes;
    }

    private isExclude(pathToCheck: string, pathToCheckStats: Stats, excludePathInfoes: PathInfo[]): boolean {
        // Exclude - if check file/directory is same as exclude file/directory
        if (excludePathInfoes.find((i) => isSamePaths(i.absolutePath, pathToCheck))) {
            return true;
        }

        // Exclude - if check file/directory is in exclude directory
        if (excludePathInfoes.find((i) => i.stats?.isDirectory() && isInFolder(i.absolutePath, pathToCheck))) {
            return true;
        }

        // Exclude - if exclude file is in check directory
        if (pathToCheckStats.isDirectory() && excludePathInfoes.find((i) => isInFolder(pathToCheck, i.absolutePath))) {
            return true;
        }

        return false;
    }

    private async copy(copyPathInfoes: CopyPathInfo[]): Promise<void> {
        const projectRoot = this.options.workspaceInfo.projectRoot;

        for (const copyPathInfo of copyPathInfoes) {
            this.logger.debug(
                `Copying ${normalizePathToPOSIXStyle(path.relative(projectRoot, copyPathInfo.fromPath))}`
            );

            if (this.options.dryRun) {
                continue;
            }

            if (!(await pathExists(path.dirname(copyPathInfo.toPath)))) {
                await fs.mkdir(path.dirname(copyPathInfo.toPath), {
                    mode: 0o777,
                    recursive: true
                });
            }

            await fs.copyFile(copyPathInfo.fromPath, copyPathInfo.toPath);
        }
    }
}

export function getCopyTaskRunner(buildTask: ParsedBuildTask, logger: Logger, dryRun = false): CopyTaskRunner | null {
    if (!buildTask.copy?.length) {
        return null;
    }

    const copyEntries = buildTask.copy.map((copyEntry) =>
        typeof copyEntry === 'string' ? { from: copyEntry } : { ...copyEntry }
    );

    if (!copyEntries.filter((e) => e.from?.trim().length).length) {
        return null;
    }

    const copyTaskRunner = new CopyTaskRunner({
        copyEntries,
        dryRun,
        workspaceInfo: buildTask._workspaceInfo,
        outDir: buildTask._outDir,
        logger
    });

    return copyTaskRunner;
}
