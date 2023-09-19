import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BuildTask } from '../config-models/index.js';
import { PackageJsonInfo, ParsedBuildTaskConfig, WorkspaceInfo } from '../config-models/parsed/index.js';
import { InvalidConfigError } from '../exceptions/index.js';
import { findUp, isInFolder, isSamePaths, pathExists, resolvePath } from '../utils/index.js';

function validateOutDir(outDir: string, workspaceInfo: WorkspaceInfo): void {
    const workspaceRoot = workspaceInfo.workspaceRoot;
    const projectRoot = workspaceInfo.projectRoot;
    const projectName = workspaceInfo.projectName ?? '0';
    const configLocationPrefix = `projects/${projectName}/tasks/build`;
    const configPath = workspaceInfo.configPath;

    if (!outDir?.trim().length) {
        throw new InvalidConfigError(`The 'outDir' must not be empty.`, configPath, `${configLocationPrefix}/outDir`);
    }

    if (outDir.trim() === '/' || outDir.trim() === '\\' || isSamePaths(outDir, path.parse(outDir).root)) {
        throw new InvalidConfigError(
            `The 'outDir' must not be system root directory.`,
            configPath,
            `${configLocationPrefix}/outDir`
        );
    }

    if (isInFolder(outDir, workspaceRoot) || isInFolder(outDir, process.cwd())) {
        throw new InvalidConfigError(
            `The 'outDir' must not be parent of worksapce root or current working directory.`,
            configPath,
            `${configLocationPrefix}/outDir`
        );
    }

    if (isInFolder(outDir, projectRoot)) {
        throw new InvalidConfigError(
            `The 'outDir' must not be parent of project root directory.`,
            configPath,
            `${configLocationPrefix}/outDir`
        );
    }
}

async function parseBannerText(
    banner: string | boolean,
    workspaceInfo: WorkspaceInfo,
    packageJsonInfo: PackageJsonInfo | null
): Promise<string | null> {
    if (!banner) {
        return null;
    }

    let bannerText: string | null = null;
    const configLocationPrefix = `projects/${workspaceInfo.projectName ?? '0'}/build`;

    if (banner === true || (typeof banner === 'string' && banner.trim().toLowerCase() === 'true')) {
        const bannerFilePath = await findUp('banner.txt', workspaceInfo.projectRoot, workspaceInfo.workspaceRoot);
        if (bannerFilePath) {
            bannerText = await fs.readFile(bannerFilePath, 'utf-8');
            bannerText = bannerText.trim();
        } else {
            throw new InvalidConfigError(
                `Banner file could not be found.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}/banner`
            );
        }
    } else if (typeof banner === 'string') {
        const trimedbanner = banner.trim();

        if (
            !trimedbanner.startsWith('//') &&
            !trimedbanner.startsWith('/*') &&
            !/[\n\r\t\s:*?"]/.test(trimedbanner) &&
            trimedbanner.length <= 4096
        ) {
            const bannerFilePath = resolvePath(workspaceInfo.projectRoot, trimedbanner);
            if (await pathExists(bannerFilePath)) {
                bannerText = await fs.readFile(bannerFilePath, 'utf-8');
                bannerText = bannerText.trim();
            } else {
                if (/\.txt$/i.test(trimedbanner)) {
                    throw new InvalidConfigError(
                        `Banner file could not be found.`,
                        workspaceInfo.configPath,
                        `${configLocationPrefix}/banner`
                    );
                } else {
                    bannerText = trimedbanner;
                }
            }
        } else {
            bannerText = trimedbanner;
        }
    }

    if (bannerText) {
        if (!bannerText.startsWith('//') && !bannerText.startsWith('/*')) {
            const commentEndRegExp = /\*\//g;

            const wrapComment = (str: string) => {
                if (!str.includes('\n')) {
                    return `/*! ${str.replace(commentEndRegExp, '* /')} */`;
                }
                return `/*!\n * ${str
                    .replace(/\*\//g, '* /')
                    .split('\n')
                    .join('\n * ')
                    .replace(/\s+\n/g, '\n')
                    .trimEnd()}\n */`;
            };

            bannerText = wrapComment(bannerText);
        }

        bannerText = bannerText.replace(/\[current_?year\]/gim, new Date().getFullYear().toString());

        if (workspaceInfo.projectName) {
            bannerText = bannerText.replace(/\[project_?name\]/gim, workspaceInfo.projectName);
        }

        if (packageJsonInfo) {
            const packageName = packageJsonInfo.packageName;
            const packageVersion = packageJsonInfo.newPackageVersion ?? packageJsonInfo.packageJson.version;
            const mergedPackageJson = packageJsonInfo.rootPackageJson
                ? { ...packageJsonInfo.rootPackageJson, ...packageJsonInfo.packageJson }
                : packageJsonInfo.packageJson;

            bannerText = bannerText.replace(/\[package_?name\]/gim, packageName);

            if (packageVersion && typeof packageVersion === 'string') {
                bannerText = bannerText.replace(/\[package_?version\]/gim, packageVersion);
            }

            if (mergedPackageJson.description && typeof mergedPackageJson.description === 'string') {
                bannerText = bannerText.replace(/\[package_?description\]/gim, mergedPackageJson.description);
            }

            if (mergedPackageJson.license && typeof mergedPackageJson.license === 'string') {
                bannerText = bannerText.replace(/\[(package_?)?license\]/gim, mergedPackageJson.license);
            }

            if (mergedPackageJson.homepage && typeof mergedPackageJson.homepage === 'string') {
                bannerText = bannerText.replace(/\[(package_?)?homepage\]/gim, mergedPackageJson.homepage);
            }

            if (mergedPackageJson.author) {
                let author: string | null = null;
                if (typeof mergedPackageJson.author === 'string') {
                    author = mergedPackageJson.author;
                } else if (
                    typeof mergedPackageJson.author === 'object' &&
                    (mergedPackageJson.author as { name: string }).name
                ) {
                    author = (mergedPackageJson.author as { name: string }).name;
                }

                if (author) {
                    bannerText = bannerText.replace(/\[(package_?)?author\]/gim, author);
                }
            }
        }
    }

    return bannerText;
}

export async function getParsedBuildTask(
    buildTask: BuildTask,
    workspaceInfo: WorkspaceInfo,
    packageJsonInfo: PackageJsonInfo | null
): Promise<ParsedBuildTaskConfig> {
    const projectRoot = workspaceInfo.projectRoot;

    let outDir = path.resolve(projectRoot, 'dist');
    if (buildTask.outDir?.trim().length) {
        outDir = resolvePath(projectRoot, buildTask.outDir);
        validateOutDir(outDir, workspaceInfo);
    }

    const bannerText = buildTask.banner
        ? await parseBannerText(buildTask.banner, workspaceInfo, packageJsonInfo)
        : null;

    const parsedBuildTask: ParsedBuildTaskConfig = {
        ...buildTask,
        _taskName: 'build',
        _workspaceInfo: workspaceInfo,
        _packageJsonInfo: packageJsonInfo,
        _outDir: outDir,
        _bannerText: bannerText
    };

    return parsedBuildTask;
}
