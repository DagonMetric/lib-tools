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
        test: /\[current_?year\]/gi,
        value: new Date().getFullYear().toString(),
        description: 'current year',
        bannerOnly: true
    });

    if (workspaceInfo.projectName) {
        substitutions.push({
            test: /\[project_?name\]/gi,
            value: workspaceInfo.projectName,
            description: 'project name',
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
            test: /\[package_?name\]/gi,
            value: packageName,
            description: 'package name',
            bannerOnly: true
        });

        if (packageVersion && typeof packageVersion === 'string') {
            substitutions.push({
                test: /(\[package_?version\]|0\.0\.0-placeholder)/gi,
                value: packageVersion,
                description: 'package version',
                bannerOnly: false
            });
        }

        if (mergedPackageJson.description && typeof mergedPackageJson.description === 'string') {
            substitutions.push({
                test: /\[description\]/gi,
                value: mergedPackageJson.description,
                description: 'description',
                bannerOnly: true
            });
        }

        if (mergedPackageJson.license && typeof mergedPackageJson.license === 'string') {
            substitutions.push({
                test: /\[license\]/gi,
                value: mergedPackageJson.license,
                description: 'license',
                bannerOnly: true
            });
        }

        if (mergedPackageJson.homepage && typeof mergedPackageJson.homepage === 'string') {
            substitutions.push({
                test: /\[homepage\]/gi,
                value: mergedPackageJson.homepage,
                description: 'homepage',
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
                    test: /\[author\]/gi,
                    value: author,
                    description: 'author',
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
    substitutions: { test: RegExp; value: string; description: string }[]
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

        for (const substitution of substitutions) {
            bannerText = bannerText.replace(substitution.test, substitution.value);
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

    const bannerText = buildTask.banner ? await parseBannerText(buildTask.banner, workspaceInfo, substitutions) : null;

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
