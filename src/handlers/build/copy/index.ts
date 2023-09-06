import { glob } from 'glob';
import { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidConfigError } from '../../../exceptions/index.js';
import { CopyEntry } from '../../../models/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../../../models/parsed/index.js';
import {
    AbsolutePathInfo,
    Logger,
    getAbsolutePathInfoes,
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
    fromFilePath: string;
    toFilePath: string;
}

async function globFiles(globPattern: string, cwd: string): Promise<string[]> {
    const procesedFilePaths: string[] = [];

    const foundPaths = await glob(globPattern, {
        cwd,
        dot: true,
        absolute: true
    });

    for (const foundPath of foundPaths) {
        const isSystemRoot = isSamePaths(path.parse(foundPath).root, foundPath);
        let stats: Stats | null = null;
        if (!isSystemRoot) {
            stats = await fs.stat(foundPath);
        }

        if (stats?.isFile()) {
            if (!procesedFilePaths.includes(foundPath)) {
                procesedFilePaths.push(foundPath);
            }
        } else {
            const foundFilePaths = await glob('**/*', {
                cwd: foundPath,
                nodir: true,
                dot: true,
                absolute: true
            });

            for (const foundFilePath of foundFilePaths) {
                if (!procesedFilePaths.includes(foundPath)) {
                    procesedFilePaths.push(foundFilePath);
                }
            }
        }
    }

    return procesedFilePaths;
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

        return copyPathInfoes.map((i) => i.toFilePath);
    }

    private async getCopyPathInfoes(): Promise<CopyPathInfo[]> {
        const copyPathInfoes: CopyPathInfo[] = [];

        const copyEntries = this.options.copyEntries;
        const outDir = this.options.outDir;
        const projectRoot = this.options.workspaceInfo.projectRoot;

        for (const copyEntry of copyEntries) {
            let normalizedFrom = normalizePathToPOSIXStyle(copyEntry.from);

            if (!normalizedFrom && /^[./\\]/.test(copyEntry.from)) {
                normalizedFrom = './';
            }

            if (!normalizedFrom) {
                continue;
            }

            const excludePathInfoes = await getAbsolutePathInfoes(copyEntry.exclude ?? [], projectRoot);

            if (glob.hasMagic(normalizedFrom)) {
                const foundFilePaths = await globFiles(normalizedFrom, projectRoot);

                if (!foundFilePaths.length) {
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

                for (const foundFilePath of foundFilePaths) {
                    if (excludePathInfoes.length) {
                        if (this.checkFileForExclude(foundFilePath, excludePathInfoes)) {
                            this.logger.debug(`Excluded from copy, path: ${foundFilePath}.`);
                            continue;
                        }
                    }

                    const toPathRel = path.relative(fromBasePath, foundFilePath);
                    const toFilePath = path.resolve(toBasePath, toPathRel);

                    if (!copyPathInfoes.find((f) => f.fromFilePath === foundFilePath && f.toFilePath === toFilePath)) {
                        copyPathInfoes.push({
                            fromFilePath: foundFilePath,
                            toFilePath
                        });
                    }
                }
            } else {
                const fromPath =
                    isWindowsStyleAbsolute(normalizedFrom) && process.platform === 'win32'
                        ? path.resolve(normalizedFrom)
                        : path.resolve(projectRoot, normalizedFrom);

                if (!(await pathExists(fromPath))) {
                    this.logger.warn(`Path doesn't exist to copy, path: ${fromPath}`);
                    continue;
                }

                const toBasePath =
                    copyEntry.to && isWindowsStyleAbsolute(copyEntry.to) && process.platform === 'win32'
                        ? path.resolve(normalizePathToPOSIXStyle(copyEntry.to))
                        : path.resolve(outDir, normalizePathToPOSIXStyle(copyEntry.to ?? ''));

                const fromPathStats = await fs.stat(fromPath);

                if (fromPathStats.isFile()) {
                    const foundFromPath = fromPath;

                    if (excludePathInfoes.length) {
                        if (this.checkFileForExclude(foundFromPath, excludePathInfoes)) {
                            this.logger.debug(`Excluded from copy, path: ${foundFromPath}.`);
                            continue;
                        }
                    }

                    const fromExt = path.extname(foundFromPath);
                    const toExt = path.extname(toBasePath);
                    let toFilePath = toBasePath;
                    if (
                        !copyEntry.to?.trim().length ||
                        copyEntry.to.trim().endsWith('/') ||
                        isSamePaths(outDir, toBasePath) ||
                        (fromExt && !toExt)
                    ) {
                        toFilePath = path.resolve(toBasePath, path.basename(foundFromPath));
                    }

                    if (!copyPathInfoes.find((f) => f.fromFilePath === foundFromPath && f.toFilePath === toFilePath)) {
                        copyPathInfoes.push({
                            fromFilePath: foundFromPath,
                            toFilePath
                        });
                    }
                } else {
                    const foundFilePaths = await glob('**/*', {
                        cwd: fromPath,
                        nodir: true,
                        dot: true,
                        absolute: true
                    });

                    if (!foundFilePaths.length) {
                        continue;
                    }

                    for (const foundFilePath of foundFilePaths) {
                        if (excludePathInfoes.length) {
                            if (this.checkFileForExclude(foundFilePath, excludePathInfoes)) {
                                this.logger.debug(`Excluded from copy, path: ${foundFilePath}.`);
                                continue;
                            }
                        }

                        const foundFilePathRel = normalizePathToPOSIXStyle(path.relative(fromPath, foundFilePath));
                        const toFilePath = path.resolve(toBasePath, foundFilePathRel);

                        if (
                            !copyPathInfoes.find((f) => f.fromFilePath === foundFilePath && f.toFilePath === toFilePath)
                        ) {
                            copyPathInfoes.push({
                                fromFilePath: foundFilePath,
                                toFilePath
                            });
                        }
                    }
                }
            }
        }

        return copyPathInfoes;
    }

    private checkFileForExclude(filePathToCheck: string, excludePathInfoes: AbsolutePathInfo[]): boolean {
        // if check file/directory is same as exclude file/directory
        if (excludePathInfoes.find((i) => isSamePaths(i.path, filePathToCheck))) {
            return true;
        }

        // if check file/directory is in exclude directory
        if (excludePathInfoes.find((i) => i.isDirectory && isInFolder(i.path, filePathToCheck))) {
            return true;
        }

        return false;
    }

    private async copy(copyPathInfoes: CopyPathInfo[]): Promise<void> {
        const projectRoot = this.options.workspaceInfo.projectRoot;

        for (const copyPathInfo of copyPathInfoes) {
            this.logger.info(
                `Copying file: ${normalizePathToPOSIXStyle(path.relative(projectRoot, copyPathInfo.fromFilePath))}`
            );

            if (this.options.dryRun) {
                continue;
            }

            const dirOfFile = path.dirname(copyPathInfo.toFilePath);

            if (!(await pathExists(dirOfFile))) {
                await fs.mkdir(dirOfFile, { recursive: true });
            }

            await fs.copyFile(copyPathInfo.fromFilePath, copyPathInfo.toFilePath);
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
