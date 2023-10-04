import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BuildTask } from '../config-models/index.js';
import {
    PackageJsonInfo,
    ParsedBuildTaskConfig,
    SubstitutionInfo,
    WorkspaceInfo
} from '../config-models/parsed/index.js';
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

function getSubstitutions(workspaceInfo: WorkspaceInfo, packageJsonInfo: PackageJsonInfo | null): SubstitutionInfo[] {
    const substitutions: SubstitutionInfo[] = [];

    substitutions.push({
        searchString: '[CURRENT_YEAR]',
        searchRegExp: /\[CURRENT_YEAR\]/g,
        value: new Date().getFullYear().toString(),
        bannerOnly: true
    });

    if (workspaceInfo.projectName) {
        substitutions.push({
            searchString: '[PROJECT_NAME]',
            searchRegExp: /\[PROJECT_NAME\]/g,
            value: workspaceInfo.projectName,
            bannerOnly: true
        });
    }

    if (packageJsonInfo) {
        const packageName = packageJsonInfo.packageName;
        const packageVersion = packageJsonInfo.newPackageVersion ?? packageJsonInfo.packageJson.version;
        const mergedPackageJson = packageJsonInfo.rootPackageJson
            ? { ...packageJsonInfo.rootPackageJson, ...packageJsonInfo.packageJson }
            : packageJsonInfo.packageJson;

        substitutions.push({
            searchString: '[PACKAGE_NAME]',
            searchRegExp: /\[PACKAGE_NAME\]/g,
            value: packageName,
            bannerOnly: true
        });

        if (packageVersion && typeof packageVersion === 'string') {
            substitutions.push({
                searchString: '[PACKAGE_VERSION]',
                searchRegExp: /\[PACKAGE_VERSION\]/g,
                value: packageVersion,
                bannerOnly: true
            });

            substitutions.push({
                searchString: '0.0.0-PLACEHOLDER',
                searchRegExp: /0\.0\.0-PLACEHOLDER/g,
                value: packageVersion,
                bannerOnly: false
            });
        }

        if (mergedPackageJson.description && typeof mergedPackageJson.description === 'string') {
            substitutions.push({
                searchString: '[DESCRIPTION]',
                searchRegExp: /\[DESCRIPTION\]/g,
                value: mergedPackageJson.description,
                bannerOnly: true
            });
        }

        if (mergedPackageJson.license && typeof mergedPackageJson.license === 'string') {
            substitutions.push({
                searchString: '[LICENSE]',
                searchRegExp: /\[LICENSE\]/g,
                value: mergedPackageJson.license,
                bannerOnly: true
            });
        }

        if (mergedPackageJson.homepage && typeof mergedPackageJson.homepage === 'string') {
            substitutions.push({
                searchString: '[HOMEPAGE]',
                searchRegExp: /\[HOMEPAGE\]/g,
                value: mergedPackageJson.homepage,
                bannerOnly: true
            });
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
                substitutions.push({
                    searchString: '[AUTHOR]',
                    searchRegExp: /\[AUTHOR\]/g,
                    value: author,
                    bannerOnly: true
                });
            }
        }
    }

    return substitutions;
}

async function parseBannerText(
    banner: string | boolean,
    workspaceInfo: WorkspaceInfo,
    substitutions: SubstitutionInfo[]
): Promise<string | undefined> {
    if (!banner) {
        return undefined;
    }

    let bannerText: string | undefined;
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

        for (const substitution of substitutions) {
            bannerText = bannerText.replace(substitution.searchRegExp, substitution.value);
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

    const substitutions = getSubstitutions(workspaceInfo, packageJsonInfo);

    const bannerText = buildTask.banner
        ? await parseBannerText(buildTask.banner, workspaceInfo, substitutions)
        : undefined;

    const parsedBuildTask: ParsedBuildTaskConfig = {
        ...buildTask,
        _taskName: 'build',
        _workspaceInfo: workspaceInfo,
        _packageJsonInfo: packageJsonInfo,
        _outDir: outDir,
        _bannerText: bannerText,
        _substitutions: substitutions
    };

    return parsedBuildTask;
}
