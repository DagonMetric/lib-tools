import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BannerOptions, BuildTask } from '../config-models/index.js';
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
        searchString: '[CURRENTYEAR]',
        value: new Date().getFullYear().toString(),
        bannerOnly: true
    });

    if (workspaceInfo.projectName) {
        substitutions.push({
            searchString: '[PROJECTNAME]',
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
            searchString: '[PACKAGENAME]',
            value: packageName,
            bannerOnly: true
        });

        if (packageVersion && typeof packageVersion === 'string') {
            substitutions.push({
                searchString: '[PACKAGEVERSION]',
                value: packageVersion,
                bannerOnly: true
            });

            substitutions.push({
                searchString: '0.0.0-PLACEHOLDER',
                value: packageVersion,
                bannerOnly: false
            });
        }

        if (mergedPackageJson.description && typeof mergedPackageJson.description === 'string') {
            substitutions.push({
                searchString: '[DESCRIPTION]',
                value: mergedPackageJson.description,
                bannerOnly: true
            });
        }

        let foundLicenseUrl = false;
        if (mergedPackageJson.license) {
            if (typeof mergedPackageJson.license === 'string') {
                const seeLicenseInStr = 'see license in';
                if (mergedPackageJson.license.toLowerCase().startsWith(seeLicenseInStr)) {
                    const rightPart = mergedPackageJson.license.substring(seeLicenseInStr.length).trim();
                    const licenseUrl = rightPart.length ? rightPart.split(' ')[0].trim() : '';
                    if (
                        licenseUrl &&
                        (licenseUrl.startsWith('http') ||
                            licenseUrl.includes('/') ||
                            licenseUrl.toLowerCase().endsWith('.txt') ||
                            licenseUrl.toLowerCase().endsWith('.md') ||
                            licenseUrl.toLowerCase() === 'license')
                    ) {
                        foundLicenseUrl = true;
                        substitutions.push({
                            searchString: '[LICENSEURL]',
                            value: licenseUrl,
                            bannerOnly: true
                        });
                    }
                } else {
                    substitutions.push({
                        searchString: '[LICENSE]',
                        value: mergedPackageJson.license,
                        bannerOnly: true
                    });
                }
            } else if (typeof mergedPackageJson.license === 'object') {
                const licenseObj = mergedPackageJson.license as { type?: string; url?: string };
                if (licenseObj.type) {
                    substitutions.push({
                        searchString: '[LICENSE]',
                        value: licenseObj.type,
                        bannerOnly: true
                    });
                }

                if (licenseObj.url) {
                    foundLicenseUrl = true;
                    substitutions.push({
                        searchString: '[LICENSEURL]',
                        value: licenseObj.url,
                        bannerOnly: true
                    });
                }
            }
        }

        if (mergedPackageJson.homepage && typeof mergedPackageJson.homepage === 'string') {
            substitutions.push({
                searchString: '[HOMEPAGE]',
                value: mergedPackageJson.homepage,
                bannerOnly: true
            });

            if (!foundLicenseUrl) {
                substitutions.push({
                    searchString: '[LICENSEURL]',
                    value: mergedPackageJson.homepage,
                    bannerOnly: true
                });
            }
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
                    value: author,
                    bannerOnly: true
                });
            }
        }
    }

    return substitutions;
}

async function parseBannerOrFooter(
    forFooter: boolean,
    input: string | BannerOptions,
    workspaceInfo: WorkspaceInfo,
    substitutions: SubstitutionInfo[]
): Promise<{
    textForJs: string | undefined;
    textForCss: string | undefined;
}> {
    let textForJs: string | undefined;
    let textForCss: string | undefined;

    const configLocation = `projects/${workspaceInfo.projectName ?? '0'}/build/${forFooter ? 'footer' : 'banner'}`;

    if (typeof input === 'string' && input === 'auto') {
        const jsFilePath = await findUp(
            forFooter ? 'footer.js.txt' : 'banner.js.txt',
            workspaceInfo.projectRoot,
            workspaceInfo.workspaceRoot
        );
        const cssFilePath = await findUp(
            forFooter ? 'footer.css.txt' : 'banner.css.txt',
            workspaceInfo.projectRoot,
            workspaceInfo.workspaceRoot
        );

        let sharedText: string | undefined;
        const sharedFilePath = await findUp(
            forFooter ? 'footer.txt' : 'banner.txt',
            workspaceInfo.projectRoot,
            workspaceInfo.workspaceRoot
        );
        if (sharedFilePath) {
            const content = await fs.readFile(sharedFilePath, 'utf-8');
            sharedText = content.trim();
        }

        if (jsFilePath) {
            const content = await fs.readFile(jsFilePath, 'utf-8');
            textForJs = content.trim();
        } else {
            textForJs = sharedText;
        }

        if (cssFilePath) {
            const content = await fs.readFile(cssFilePath, 'utf-8');
            textForCss = content.trim();
        } else {
            textForCss = sharedText;
        }

        if (!jsFilePath && !cssFilePath) {
            throw new InvalidConfigError(
                `${forFooter ? 'Footer' : 'Banner'} file could not be found.`,
                workspaceInfo.configPath,
                `${configLocation}`
            );
        }
    } else if (typeof input === 'string') {
        const trimedInput = input.trim();

        if (
            !trimedInput.startsWith('//') &&
            !trimedInput.startsWith('/*') &&
            !/[\n\r\t\s:*?"]/.test(trimedInput) &&
            trimedInput.length <= 4096
        ) {
            const filePath = resolvePath(workspaceInfo.projectRoot, trimedInput);
            if (await pathExists(filePath)) {
                let content = await fs.readFile(filePath, 'utf-8');
                content = content.trim();

                const filePathWithoutExt = filePath.substring(0, filePath.length - path.extname(filePath).length);
                if (/[.-]js$/i.test(filePathWithoutExt)) {
                    textForJs = content;
                } else if (/[.-]css$/i.test(filePathWithoutExt)) {
                    textForCss = content;
                } else {
                    textForJs = content;
                    textForCss = content;
                }
            } else {
                if (/\.txt$/i.test(filePath)) {
                    throw new InvalidConfigError(
                        `${forFooter ? 'Footer' : 'Banner'} file could not be found.`,
                        workspaceInfo.configPath,
                        `${configLocation}`
                    );
                } else {
                    textForJs = trimedInput;
                    textForCss = trimedInput;
                }
            }
        } else {
            textForJs = trimedInput;
            textForCss = trimedInput;
        }
    } else {
        textForJs = input.js ?? input.text;
        textForCss = input.css ?? input.text;
    }

    const commentEndRegExp = /\*\//g;

    const wrapComment = (str: string) => {
        if (str.startsWith('//') || str.startsWith('/*')) {
            return str;
        }

        if (forFooter) {
            const lines = str.split(/[\n\r]/);
            const lastLine = lines[lines.length - 1];
            if (str.endsWith('*/') || lastLine.startsWith('//') || lastLine.startsWith('/*')) {
                return str;
            }
        }

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

    const applySubstitutions = (str: string): string => {
        for (const substitution of substitutions) {
            const escapedPattern = substitution.searchString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
            const searchRegExp = new RegExp(escapedPattern, 'g');
            str = str.replace(searchRegExp, substitution.value);
        }

        return str;
    };

    if (textForJs) {
        textForJs = wrapComment(textForJs);
        textForJs = applySubstitutions(textForJs);
    }

    if (textForCss) {
        textForCss = wrapComment(textForCss);
        textForCss = applySubstitutions(textForCss);
    }

    return {
        textForJs,
        textForCss
    };
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

    let bannerTextForJs: string | undefined;
    let bannerTextForCss: string | undefined;
    let footerTextForJs: string | undefined;
    let footerTextForCss: string | undefined;

    if (buildTask.banner) {
        const bannerOptions = await parseBannerOrFooter(false, buildTask.banner, workspaceInfo, substitutions);
        bannerTextForJs = bannerOptions.textForJs;
        bannerTextForCss = bannerOptions.textForCss;
    }

    if (buildTask.footer) {
        const footerOptions = await parseBannerOrFooter(true, buildTask.footer, workspaceInfo, substitutions);
        footerTextForJs = footerOptions.textForJs;
        footerTextForCss = footerOptions.textForCss;
    }

    const parsedBuildTask: ParsedBuildTaskConfig = {
        ...buildTask,
        _taskName: 'build',
        _workspaceInfo: workspaceInfo,
        _packageJsonInfo: packageJsonInfo,
        _outDir: outDir,
        _bannerTextForJs: bannerTextForJs,
        _bannerTextForCss: bannerTextForCss,
        _footerTextForJs: footerTextForJs,
        _footerTextForCss: footerTextForCss,
        _substitutions: substitutions
    };

    return parsedBuildTask;
}
