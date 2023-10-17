/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import { SubstitutionEntry, SubstitutionOptions } from '../../config-models/index.mjs';

import { BuildTask } from '../build-task.mjs';

import { getPackageJsonInfo } from './get-package-json-info.mjs';

export async function getSubstitutions(
    substitutions: boolean | Readonly<SubstitutionOptions> | undefined,
    buildTask: Readonly<BuildTask>
): Promise<SubstitutionEntry[]> {
    if (!substitutions) {
        return [];
    }

    const substitutionOptions = typeof substitutions === 'object' ? { ...substitutions } : ({} as SubstitutionOptions);
    const { projectName } = buildTask;

    const newSubstitutions: SubstitutionEntry[] = [];

    newSubstitutions.push({
        searchValue: '[CURRENTYEAR]',
        replaceValue: new Date().getFullYear().toString(),
        bannerOnly: substitutionOptions.bannerOnly ?? true,
        exclude: substitutionOptions.exclude,
        include: substitutionOptions.include
    });

    if (projectName) {
        newSubstitutions.push({
            searchValue: '[PROJECTNAME]',
            replaceValue: projectName,
            bannerOnly: substitutionOptions.bannerOnly ?? true,
            exclude: substitutionOptions.exclude,
            include: substitutionOptions.include
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
            bannerOnly: substitutionOptions.bannerOnly ?? true,
            exclude: substitutionOptions.exclude,
            include: substitutionOptions.include
        });

        if (packageVersion && typeof packageVersion === 'string') {
            newSubstitutions.push({
                searchValue: '[PACKAGEVERSION]',
                replaceValue: packageVersion,
                bannerOnly: substitutionOptions.bannerOnly ?? false,
                exclude: substitutionOptions.exclude,
                include: substitutionOptions.include
            });

            newSubstitutions.push({
                searchValue: '0.0.0-PLACEHOLDER',
                replaceValue: packageVersion,
                bannerOnly: substitutionOptions.bannerOnly ?? false,
                exclude: substitutionOptions.exclude,
                include: substitutionOptions.include
            });
        }

        if (mergedPackageJson.description && typeof mergedPackageJson.description === 'string') {
            newSubstitutions.push({
                searchValue: '[DESCRIPTION]',
                replaceValue: mergedPackageJson.description,
                bannerOnly: substitutionOptions.bannerOnly ?? true,
                exclude: substitutionOptions.exclude,
                include: substitutionOptions.include
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
                            bannerOnly: substitutionOptions.bannerOnly ?? true,
                            exclude: substitutionOptions.exclude,
                            include: substitutionOptions.include
                        });
                    }
                } else {
                    newSubstitutions.push({
                        searchValue: '[LICENSE]',
                        replaceValue: mergedPackageJson.license,
                        bannerOnly: substitutionOptions.bannerOnly ?? true,
                        exclude: substitutionOptions.exclude,
                        include: substitutionOptions.include
                    });
                }
            } else if (typeof mergedPackageJson.license === 'object') {
                const licenseObj = mergedPackageJson.license as { type?: string; url?: string };
                if (licenseObj.type) {
                    newSubstitutions.push({
                        searchValue: '[LICENSE]',
                        replaceValue: licenseObj.type,
                        bannerOnly: substitutionOptions.bannerOnly ?? true,
                        exclude: substitutionOptions.exclude,
                        include: substitutionOptions.include
                    });
                }

                if (licenseObj.url) {
                    foundLicenseUrl = true;
                    newSubstitutions.push({
                        searchValue: '[LICENSEURL]',
                        replaceValue: licenseObj.url,
                        bannerOnly: substitutionOptions.bannerOnly ?? true,
                        exclude: substitutionOptions.exclude,
                        include: substitutionOptions.include
                    });
                }
            }
        }

        if (mergedPackageJson.homepage && typeof mergedPackageJson.homepage === 'string') {
            if (!foundLicenseUrl) {
                newSubstitutions.push({
                    searchValue: '[LICENSEURL]',
                    replaceValue: mergedPackageJson.homepage,
                    bannerOnly: substitutionOptions.bannerOnly ?? true,
                    exclude: substitutionOptions.exclude,
                    include: substitutionOptions.include
                });
            }

            newSubstitutions.push({
                searchValue: '[HOMEPAGE]',
                replaceValue: mergedPackageJson.homepage,
                bannerOnly: substitutionOptions.bannerOnly ?? true,
                exclude: substitutionOptions.exclude,
                include: substitutionOptions.include
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
                    bannerOnly: substitutionOptions.bannerOnly ?? true,
                    exclude: substitutionOptions.exclude,
                    include: substitutionOptions.include
                });
            }
        }
    }

    if (substitutionOptions.values && substitutionOptions.values.length > 0) {
        for (const substitution of substitutionOptions.values) {
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
