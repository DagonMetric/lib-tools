import { glob } from 'glob';

import { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { CopyEntry } from '../../../config-models/index.js';
import { WorkspaceInfo } from '../../../config-models/parsed/index.js';
import {
    AbsolutePathInfo,
    Logger,
    LoggerBase,
    colors,
    getAbsolutePathInfoes,
    isInFolder,
    isSamePaths,
    normalizePathToPOSIXStyle,
    pathExists,
    resolvePath
} from '../../../utils/index.js';

import { BuildTaskHandleContext } from '../../interfaces/index.js';

export interface CopyFileInfo {
    from: string;
    to: string;
}

export interface CopyTaskRunnerOptions {
    readonly logger: LoggerBase;
    readonly copyEntries: CopyEntry[];
    readonly workspaceInfo: WorkspaceInfo;
    readonly outDir: string;
    readonly dryRun: boolean | undefined;
}

export interface CopyTaskResult {
    readonly copiedFileInfoes: CopyFileInfo[];
    readonly excludedPaths: string[];
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
    private readonly logger: LoggerBase;
    private startTime = Date.now();

    constructor(readonly options: CopyTaskRunnerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<CopyTaskResult> {
        const projectRoot = this.options.workspaceInfo.projectRoot;
        const outDir = this.options.outDir;
        const copyResult: CopyTaskResult = {
            copiedFileInfoes: [],
            excludedPaths: []
        };

        this.logStart();

        for (const copyEntry of this.options.copyEntries) {
            let normalizedFrom = normalizePathToPOSIXStyle(copyEntry.from);

            if (!normalizedFrom && /^[./\\]/.test(copyEntry.from)) {
                normalizedFrom = './';
            }

            if (!normalizedFrom) {
                this.logger.warn(`There is no matched file to copy, path: ${copyEntry.from.trim()}`);
                if (!copyResult.excludedPaths.includes(copyEntry.from.trim())) {
                    copyResult.excludedPaths.push(copyEntry.from.trim());
                }

                continue;
            }

            const excludePathInfoes = await getAbsolutePathInfoes(copyEntry.exclude ?? [], projectRoot);

            if (glob.hasMagic(normalizedFrom)) {
                const foundFilePaths = await globFiles(normalizedFrom, projectRoot);

                if (!foundFilePaths.length) {
                    this.logger.warn(`There is no matched file to copy, pattern: ${copyEntry.from}`);
                    if (!copyResult.excludedPaths.includes(copyEntry.from.trim())) {
                        copyResult.excludedPaths.push(copyEntry.from.trim());
                    }

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

                const toBasePath = resolvePath(outDir, copyEntry.to ?? '');

                for (const foundFilePath of foundFilePaths) {
                    if (excludePathInfoes.length) {
                        if (this.checkFileForExclude(foundFilePath, excludePathInfoes)) {
                            this.logger.debug(`Excluded from copy, path: ${foundFilePath}.`);

                            if (!copyResult.excludedPaths.includes(foundFilePath)) {
                                copyResult.excludedPaths.push(foundFilePath);
                            }

                            continue;
                        }
                    }

                    const toPathRel = path.relative(fromBasePath, foundFilePath);
                    const toFilePath = path.resolve(toBasePath, toPathRel);

                    if (
                        !copyResult.copiedFileInfoes.find(
                            (f) => isSamePaths(f.from, foundFilePath) && isSamePaths(f.to, toFilePath)
                        )
                    ) {
                        copyResult.copiedFileInfoes.push({
                            from: foundFilePath,
                            to: toFilePath
                        });
                    }
                }
            } else {
                const fromPath = resolvePath(projectRoot, normalizedFrom);

                if (!(await pathExists(fromPath))) {
                    this.logger.warn(`Path doesn't exist to copy, path: ${fromPath}`);
                    if (!copyResult.excludedPaths.includes(fromPath)) {
                        copyResult.excludedPaths.push(fromPath);
                    }

                    continue;
                }

                const toBasePath = resolvePath(outDir, copyEntry.to ?? '');

                const fromPathStats = await fs.stat(fromPath);

                if (fromPathStats.isFile()) {
                    const foundFromPath = fromPath;

                    if (excludePathInfoes.length) {
                        if (this.checkFileForExclude(foundFromPath, excludePathInfoes)) {
                            this.logger.debug(`Excluded from copy, path: ${foundFromPath}.`);
                            if (!copyResult.excludedPaths.includes(foundFromPath)) {
                                copyResult.excludedPaths.push(foundFromPath);
                            }

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

                    if (
                        !copyResult.copiedFileInfoes.find(
                            (f) => isSamePaths(f.from, foundFromPath) && isSamePaths(f.to, toFilePath)
                        )
                    ) {
                        copyResult.copiedFileInfoes.push({
                            from: foundFromPath,
                            to: toFilePath
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
                                if (!copyResult.excludedPaths.includes(foundFilePath)) {
                                    copyResult.excludedPaths.push(foundFilePath);
                                }

                                continue;
                            }
                        }

                        const toFilePath = resolvePath(toBasePath, path.relative(fromPath, foundFilePath));

                        if (
                            !copyResult.copiedFileInfoes.find(
                                (f) => isSamePaths(f.from, foundFilePath) && isSamePaths(f.to, toFilePath)
                            )
                        ) {
                            copyResult.copiedFileInfoes.push({
                                from: foundFilePath,
                                to: toFilePath
                            });
                        }
                    }
                }
            }
        }

        await this.copy(copyResult.copiedFileInfoes);

        this.logComplete(copyResult);

        return copyResult;
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

    private logStart(): void {
        this.logger.group('\u25B7 copy');
        this.startTime = Date.now();
    }

    private logComplete(result: CopyTaskResult): void {
        this.logger.info(`Total ${result.copiedFileInfoes.length} files are copied.`);
        this.logger.groupEnd();
        this.logger.info(
            `${colors.lightGreen('\u25B6')} copy [${colors.lightGreen(`${Date.now() - this.startTime} ms`)}]`
        );
    }

    private async copy(copyFileInfoes: CopyFileInfo[]): Promise<void> {
        const cwd = process.cwd();

        for (const copyFileInfo of copyFileInfoes) {
            this.logger.info(
                `Copying ${normalizePathToPOSIXStyle(
                    path.relative(cwd, copyFileInfo.from)
                )} \u2192 ${normalizePathToPOSIXStyle(path.relative(cwd, copyFileInfo.to))}`
            );

            if (this.options.dryRun) {
                this.logger.debug('Actual copying is not performed because the dryRun parameter is passed.');
                continue;
            }

            const dirOfToFile = path.dirname(copyFileInfo.to);

            if (!(await pathExists(dirOfToFile))) {
                await fs.mkdir(dirOfToFile, { recursive: true });
            }

            await fs.copyFile(copyFileInfo.from, copyFileInfo.to);
        }
    }
}

export function getCopyTaskRunner(context: BuildTaskHandleContext): CopyTaskRunner | null {
    const buildTask = context.taskOptions;

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
        workspaceInfo: buildTask._workspaceInfo,
        dryRun: context.dryRun,
        outDir: buildTask._outDir,
        logger:
            context.logger ??
            new Logger({
                logLevel: context.logLevel ?? 'info',
                warnPrefix: colors.lightYellow('Warning:'),
                groupIndentation: 4
            })
    });

    return copyTaskRunner;
}
