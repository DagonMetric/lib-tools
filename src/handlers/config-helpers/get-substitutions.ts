import { SubstitutionEntry } from '../../config-models/index.js';

import { BuildTask } from '../interfaces/index.js';

import { getPackageJsonInfo } from './get-package-json-info.js';

/**
 * @internal
 */
export async function getSubstitutions(
    substitutions: readonly Readonly<SubstitutionEntry>[],
    buildTask: Readonly<BuildTask>
): Promise<SubstitutionEntry[]> {
    const { projectName } = buildTask;

    const newSubstitutions: SubstitutionEntry[] = [];

    newSubstitutions.push({
        searchValue: '[CURRENTYEAR]',
        replaceValue: new Date().getFullYear().toString(),
        bannerOnly: true
    });

    if (projectName) {
        newSubstitutions.push({
            searchValue: '[PROJECTNAME]',
            replaceValue: projectName,
            bannerOnly: true
        });
    }

    const packageJsonInfo = await getPackageJsonInfo(buildTask);

    if (packageJsonInfo) {
        const packageName = packageJsonInfo.packageName;
        const packageVersion = packageJsonInfo.newPackageVersion ?? packageJsonInfo.packageJsonConfig.version;

        const mergedPackageJson = packageJsonInfo.rootPackageJsonConfig
            ? { ...packageJsonInfo.rootPackageJsonConfig, ...packageJsonInfo.packageJsonConfig }
            : packageJsonInfo.packageJsonConfig;

        newSubstitutions.push({
            searchValue: '[PACKAGENAME]',
            replaceValue: packageName,
            bannerOnly: true
        });

        if (packageVersion && typeof packageVersion === 'string') {
            newSubstitutions.push({
                searchValue: '[PACKAGEVERSION]',
                replaceValue: packageVersion,
                bannerOnly: false
            });

            newSubstitutions.push({
                searchValue: '0.0.0-PLACEHOLDER',
                replaceValue: packageVersion,
                bannerOnly: false
            });
        }

        if (mergedPackageJson.description && typeof mergedPackageJson.description === 'string') {
            newSubstitutions.push({
                searchValue: '[DESCRIPTION]',
                replaceValue: mergedPackageJson.description,
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
                        newSubstitutions.push({
                            searchValue: '[LICENSEURL]',
                            replaceValue: licenseUrl,
                            bannerOnly: true
                        });
                    }
                } else {
                    newSubstitutions.push({
                        searchValue: '[LICENSE]',
                        replaceValue: mergedPackageJson.license,
                        bannerOnly: true
                    });
                }
            } else if (typeof mergedPackageJson.license === 'object') {
                const licenseObj = mergedPackageJson.license as { type?: string; url?: string };
                if (licenseObj.type) {
                    newSubstitutions.push({
                        searchValue: '[LICENSE]',
                        replaceValue: licenseObj.type,
                        bannerOnly: true
                    });
                }

                if (licenseObj.url) {
                    foundLicenseUrl = true;
                    newSubstitutions.push({
                        searchValue: '[LICENSEURL]',
                        replaceValue: licenseObj.url,
                        bannerOnly: true
                    });
                }
            }
        }

        if (mergedPackageJson.homepage && typeof mergedPackageJson.homepage === 'string') {
            if (!foundLicenseUrl) {
                newSubstitutions.push({
                    searchValue: '[LICENSEURL]',
                    replaceValue: mergedPackageJson.homepage,
                    bannerOnly: true
                });
            }

            newSubstitutions.push({
                searchValue: '[HOMEPAGE]',
                replaceValue: mergedPackageJson.homepage,
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
                newSubstitutions.push({
                    searchValue: '[AUTHOR]',
                    replaceValue: author,
                    bannerOnly: true
                });
            }
        }
    }

    if (substitutions && substitutions.length > 0) {
        for (const substitution of substitutions) {
            const foundItem = newSubstitutions.find((s) => s.searchValue === substitution.searchValue);
            if (foundItem != null) {
                foundItem.replaceValue = substitution.replaceValue;
                if (substitution.startDelimiter != null) {
                    foundItem.startDelimiter = substitution.startDelimiter;
                }
                if (substitution.endDelimiter != null) {
                    foundItem.endDelimiter = substitution.endDelimiter;
                }
                if (substitution.bannerOnly != null) {
                    foundItem.bannerOnly = substitution.bannerOnly;
                }
                if (substitution.include != null) {
                    foundItem.include = substitution.include;
                }
                if (substitution.exclude != null) {
                    foundItem.exclude = substitution.exclude;
                }
            } else {
                newSubstitutions.push(substitution);
            }
        }
    }

    return newSubstitutions;
}
