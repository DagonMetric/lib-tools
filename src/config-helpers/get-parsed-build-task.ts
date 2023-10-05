import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BannerFooterOptions, BuildTask } from '../config-models/index.js';
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

const bannerFooterCache = new Map<string, string>();

async function parseBannerOrFooter(
    forFooter: boolean,
    input: boolean | string | BannerFooterOptions,
    workspaceInfo: WorkspaceInfo,
    substitutions: SubstitutionInfo[]
): Promise<{
    textForScript: string | undefined;
    textForStyle: string | undefined;
}> {
    let textForScript: string | undefined;
    let textForStyle: string | undefined;

    const searchAndReadFile = async (searchFiles: string[]): Promise<string | undefined> => {
        for (const searchFile of searchFiles) {
            const cacheKey = `${workspaceInfo.projectRoot}!${searchFile}`;
            const cached = bannerFooterCache.get(cacheKey);
            if (cached != null) {
                if (cached.length > 0) {
                    return cached;
                } else {
                    continue;
                }
            }

            const foundPath = await findUp(searchFile, workspaceInfo.projectRoot, workspaceInfo.workspaceRoot, true);
            if (foundPath) {
                const cachedContent = bannerFooterCache.get(foundPath);
                if (cachedContent) {
                    return cachedContent;
                }

                let content = await fs.readFile(foundPath, 'utf-8');
                content = content.trim();

                bannerFooterCache.set(foundPath, content);
                bannerFooterCache.set(cacheKey, content);

                return content;
            } else {
                bannerFooterCache.set(cacheKey, '');
            }
        }

        return undefined;
    };

    const filesForCommon = forFooter ? ['footer.txt'] : ['banner.txt'];
    const filesForScript = forFooter ? ['footer.script.txt', 'footer.js.txt'] : ['banner.script.txt', 'banner.js.txt'];
    const filesForStyle = forFooter ? ['footer.style.txt', 'footer.css.txt'] : ['banner.style.txt', 'banner.css.txt'];

    const configLocation = `projects/${workspaceInfo.projectName ?? '0'}/build/${forFooter ? 'footer' : 'banner'}`;

    if (input === true || (typeof input === 'string' && input.trim().toLowerCase() === 'true')) {
        textForScript = await searchAndReadFile(filesForScript);
        textForStyle = await searchAndReadFile(filesForStyle);
        const textForCommon = await searchAndReadFile(filesForCommon);

        if (!textForScript) {
            textForScript = textForCommon;
        }

        if (!textForStyle) {
            textForStyle = textForCommon;
        }

        if (!textForScript && !textForStyle) {
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
            let content = bannerFooterCache.get(filePath);

            if (!content && (await pathExists(filePath))) {
                content = await fs.readFile(filePath, 'utf-8');
                content = content.trim();
                bannerFooterCache.set(filePath, content);
            }

            if (content) {
                const filePathWithoutExt = filePath.substring(0, filePath.length - path.extname(filePath).length);
                if (/[.-](script|js)$/i.test(filePathWithoutExt)) {
                    textForScript = content;
                } else if (/[.-](style|css)$/i.test(filePathWithoutExt)) {
                    textForStyle = content;
                } else {
                    textForScript = content;
                    textForStyle = content;
                }
            } else {
                if (/\.txt$/i.test(filePath)) {
                    throw new InvalidConfigError(
                        `${forFooter ? 'Footer' : 'Banner'} file could not be found.`,
                        workspaceInfo.configPath,
                        `${configLocation}`
                    );
                } else {
                    textForScript = trimedInput;
                    textForStyle = trimedInput;
                }
            }
        } else {
            textForScript = trimedInput;
            textForStyle = trimedInput;
        }
    } else if (typeof input === 'object') {
        const inputOptions = input;
        if (inputOptions.script) {
            if (typeof inputOptions.script === 'boolean' || inputOptions.script.trim().toLowerCase() === 'true') {
                textForScript = await searchAndReadFile(filesForScript);

                if (!textForScript) {
                    textForScript = await searchAndReadFile(filesForCommon);
                }

                if (!textForScript) {
                    throw new InvalidConfigError(
                        `${forFooter ? 'Footer' : 'Banner'} file could not be found for script.`,
                        workspaceInfo.configPath,
                        `${configLocation}/script`
                    );
                }
            } else {
                const trimedInput = inputOptions.script.trim();

                if (
                    !trimedInput.startsWith('//') &&
                    !trimedInput.startsWith('/*') &&
                    !/[\n\r\t\s:*?"]/.test(trimedInput) &&
                    trimedInput.length <= 4096
                ) {
                    const filePath = resolvePath(workspaceInfo.projectRoot, trimedInput);
                    let content = bannerFooterCache.get(filePath);

                    if (!content && (await pathExists(filePath))) {
                        content = await fs.readFile(filePath, 'utf-8');
                        content = content.trim();
                        bannerFooterCache.set(filePath, content);
                    }

                    if (content) {
                        textForScript = content;
                    } else {
                        if (/\.txt$/i.test(filePath)) {
                            throw new InvalidConfigError(
                                `${forFooter ? 'Footer' : 'Banner'} file could not be found for script.`,
                                workspaceInfo.configPath,
                                `${configLocation}/script`
                            );
                        } else {
                            textForScript = trimedInput;
                        }
                    }
                } else {
                    textForScript = trimedInput;
                }
            }
        }

        if (inputOptions.style) {
            if (typeof inputOptions.style === 'boolean' || inputOptions.style.trim().toLowerCase() === 'true') {
                textForStyle = await searchAndReadFile(filesForStyle);

                if (!textForStyle) {
                    textForStyle = await searchAndReadFile(filesForCommon);
                }

                if (!textForStyle) {
                    throw new InvalidConfigError(
                        `${forFooter ? 'Footer' : 'Banner'} file could not be found for style.`,
                        workspaceInfo.configPath,
                        `${configLocation}/style`
                    );
                }
            } else {
                const trimedInput = inputOptions.style.trim();

                if (
                    !trimedInput.startsWith('//') &&
                    !trimedInput.startsWith('/*') &&
                    !/[\n\r\t\s:*?"]/.test(trimedInput) &&
                    trimedInput.length <= 4096
                ) {
                    const filePath = resolvePath(workspaceInfo.projectRoot, trimedInput);
                    let content = bannerFooterCache.get(filePath);

                    if (!content && (await pathExists(filePath))) {
                        content = await fs.readFile(filePath, 'utf-8');
                        content = content.trim();
                        bannerFooterCache.set(filePath, content);
                    }

                    if (content) {
                        textForStyle = content;
                    } else {
                        if (/\.txt$/i.test(filePath)) {
                            throw new InvalidConfigError(
                                `${forFooter ? 'Footer' : 'Banner'} file could not be found for style.`,
                                workspaceInfo.configPath,
                                `${configLocation}/style`
                            );
                        } else {
                            textForStyle = trimedInput;
                        }
                    }
                } else {
                    textForStyle = trimedInput;
                }
            }
        }
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

    if (textForScript) {
        textForScript = wrapComment(textForScript);
        textForScript = applySubstitutions(textForScript);
    }

    if (textForStyle) {
        textForStyle = wrapComment(textForStyle);
        textForStyle = applySubstitutions(textForStyle);
    }

    return {
        textForScript,
        textForStyle
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

    let bannerTextForScript: string | undefined;
    let bannerTextForStyle: string | undefined;
    let footerTextForScript: string | undefined;
    let footerTextForStyle: string | undefined;

    if (buildTask.banner) {
        const bannerOptions = await parseBannerOrFooter(false, buildTask.banner, workspaceInfo, substitutions);
        bannerTextForScript = bannerOptions.textForScript;
        bannerTextForStyle = bannerOptions.textForStyle;
    }

    if (buildTask.footer) {
        const footerOptions = await parseBannerOrFooter(true, buildTask.footer, workspaceInfo, substitutions);
        footerTextForScript = footerOptions.textForScript;
        footerTextForStyle = footerOptions.textForStyle;
    }

    const parsedBuildTask: ParsedBuildTaskConfig = {
        ...buildTask,
        _taskName: 'build',
        _workspaceInfo: workspaceInfo,
        _packageJsonInfo: packageJsonInfo,
        _outDir: outDir,
        _bannerTextForScript: bannerTextForScript,
        _bannerTextForStyle: bannerTextForStyle,
        _footerTextForScript: footerTextForScript,
        _footerTextForStyle: footerTextForStyle,
        _substitutions: substitutions
    };

    return parsedBuildTask;
}
