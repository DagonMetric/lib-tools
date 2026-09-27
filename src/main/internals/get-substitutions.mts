/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { SubstitutionOptions } from '../../config-models/index.mjs';
import { getAbsolutePathInfoes } from '../../utils/index.mjs';

import { BuildTask } from '../build-task.mjs';

import { getPackageJsonInfo } from './get-package-json-info.mjs';

export interface ParsedSubstitutionEntry {
  searchValue: string;
  replaceValue: string;
  bannerOnly?: boolean;
  startDelimiter?: string;
  endDelimiter?: string;
  files?: string[];
}

export async function getSubstitutions(
  substitution: boolean | Readonly<SubstitutionOptions> | undefined,
  buildTask: Readonly<BuildTask>
): Promise<ParsedSubstitutionEntry[]> {
  if (!substitution) {
    return [];
  }

  const substitutionOptions = typeof substitution === 'object' ? { ...substitution } : ({} as SubstitutionOptions);
  const { projectRoot, projectName } = buildTask;

  const pathInfoes = substitutionOptions.files
    ? await getAbsolutePathInfoes(substitutionOptions.files, projectRoot, true)
    : undefined;
  const files = pathInfoes?.map((p) => p.path);

  const parsedSubstitutions: ParsedSubstitutionEntry[] = [];

  parsedSubstitutions.push({
    searchValue: '[CURRENTYEAR]',
    replaceValue: new Date().getFullYear().toString(),
    bannerOnly: true,
    files,
    startDelimiter: substitutionOptions.startDelimiter,
    endDelimiter: substitutionOptions.endDelimiter
  });

  if (projectName) {
    parsedSubstitutions.push({
      searchValue: '[PROJECTNAME]',
      replaceValue: projectName,
      bannerOnly: true,
      files,
      startDelimiter: substitutionOptions.startDelimiter,
      endDelimiter: substitutionOptions.endDelimiter
    });
  }

  const packageJsonInfo = await getPackageJsonInfo(buildTask);

  if (packageJsonInfo) {
    const packageName = packageJsonInfo.packageName;
    const packageVersion = packageJsonInfo.newPackageVersion ?? packageJsonInfo.packageJsonConfig.version;

    const mergedPackageJson = packageJsonInfo.rootPackageJsonConfig
      ? {
          ...packageJsonInfo.rootPackageJsonConfig,
          ...packageJsonInfo.packageJsonConfig
        }
      : packageJsonInfo.packageJsonConfig;

    parsedSubstitutions.push({
      searchValue: '[PACKAGENAME]',
      replaceValue: packageName,
      bannerOnly: true,
      files,
      startDelimiter: substitutionOptions.startDelimiter,
      endDelimiter: substitutionOptions.endDelimiter
    });

    if (packageVersion && typeof packageVersion === 'string') {
      parsedSubstitutions.push({
        searchValue: '[PACKAGEVERSION]',
        replaceValue: packageVersion,
        bannerOnly: true,
        files,
        startDelimiter: substitutionOptions.startDelimiter,
        endDelimiter: substitutionOptions.endDelimiter
      });

      parsedSubstitutions.push({
        searchValue: '0.0.0-PLACEHOLDER',
        replaceValue: packageVersion,
        bannerOnly: true,
        files,
        startDelimiter: substitutionOptions.startDelimiter,
        endDelimiter: substitutionOptions.endDelimiter
      });
    }

    if (mergedPackageJson.description && typeof mergedPackageJson.description === 'string') {
      parsedSubstitutions.push({
        searchValue: '[DESCRIPTION]',
        replaceValue: mergedPackageJson.description,
        bannerOnly: true,
        files,
        startDelimiter: substitutionOptions.startDelimiter,
        endDelimiter: substitutionOptions.endDelimiter
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
            parsedSubstitutions.push({
              searchValue: '[LICENSEURL]',
              replaceValue: licenseUrl,
              bannerOnly: true,
              files,
              startDelimiter: substitutionOptions.startDelimiter,
              endDelimiter: substitutionOptions.endDelimiter
            });
          }
        } else {
          parsedSubstitutions.push({
            searchValue: '[LICENSE]',
            replaceValue: mergedPackageJson.license,
            bannerOnly: true,
            files,
            startDelimiter: substitutionOptions.startDelimiter,
            endDelimiter: substitutionOptions.endDelimiter
          });
        }
      } else if (typeof mergedPackageJson.license === 'object') {
        const licenseObj = mergedPackageJson.license as {
          type?: string;
          url?: string;
        };
        if (licenseObj.type) {
          parsedSubstitutions.push({
            searchValue: '[LICENSE]',
            replaceValue: licenseObj.type,
            bannerOnly: true,
            files,
            startDelimiter: substitutionOptions.startDelimiter,
            endDelimiter: substitutionOptions.endDelimiter
          });
        }

        if (licenseObj.url) {
          foundLicenseUrl = true;
          parsedSubstitutions.push({
            searchValue: '[LICENSEURL]',
            replaceValue: licenseObj.url,
            bannerOnly: true,
            files,
            startDelimiter: substitutionOptions.startDelimiter,
            endDelimiter: substitutionOptions.endDelimiter
          });
        }
      }
    }

    if (mergedPackageJson.homepage && typeof mergedPackageJson.homepage === 'string') {
      if (!foundLicenseUrl) {
        parsedSubstitutions.push({
          searchValue: '[LICENSEURL]',
          replaceValue: mergedPackageJson.homepage,
          bannerOnly: true,
          files,
          startDelimiter: substitutionOptions.startDelimiter,
          endDelimiter: substitutionOptions.endDelimiter
        });
      }

      parsedSubstitutions.push({
        searchValue: '[HOMEPAGE]',
        replaceValue: mergedPackageJson.homepage,
        bannerOnly: true,
        files,
        startDelimiter: substitutionOptions.startDelimiter,
        endDelimiter: substitutionOptions.endDelimiter
      });
    }

    if (mergedPackageJson.author) {
      let author: string | null = null;
      if (typeof mergedPackageJson.author === 'string') {
        author = mergedPackageJson.author;
      } else if (typeof mergedPackageJson.author === 'object' && (mergedPackageJson.author as { name: string }).name) {
        author = (mergedPackageJson.author as { name: string }).name;
      }

      if (author) {
        parsedSubstitutions.push({
          searchValue: '[AUTHOR]',
          replaceValue: author,
          bannerOnly: true,
          files,
          startDelimiter: substitutionOptions.startDelimiter,
          endDelimiter: substitutionOptions.endDelimiter
        });
      }
    }
  }

  if (substitutionOptions.values && substitutionOptions.values.length > 0) {
    for (const substitutionEntry of substitutionOptions.values) {
      const foundItem = parsedSubstitutions.find((s) => s.searchValue === substitutionEntry.searchValue);
      if (foundItem) {
        if (substitutionEntry.replaceValue != null) {
          foundItem.replaceValue = substitutionEntry.replaceValue;
        }

        if (substitutionEntry.startDelimiter != null) {
          foundItem.startDelimiter = substitutionEntry.startDelimiter;
        }

        if (substitutionEntry.endDelimiter != null) {
          foundItem.endDelimiter = substitutionEntry.endDelimiter;
        }

        if (substitutionEntry.bannerOnly != null) {
          foundItem.bannerOnly = substitutionEntry.bannerOnly;
        }

        if (substitutionEntry.files != null) {
          const itemPathInfoes = await getAbsolutePathInfoes(substitutionEntry.files, projectRoot, true);
          const itemfiles = itemPathInfoes?.map((p) => p.path);
          foundItem.files = itemfiles;
        }
      } else {
        const newSubstitution: ParsedSubstitutionEntry = {
          searchValue: substitutionEntry.searchValue,
          replaceValue: substitutionEntry.replaceValue,
          startDelimiter: substitutionEntry.startDelimiter ?? substitutionOptions.startDelimiter,
          endDelimiter: substitutionEntry.endDelimiter ?? substitutionOptions.endDelimiter,
          bannerOnly: substitutionEntry.bannerOnly
        };

        if (substitutionEntry.files != null) {
          const itemPathInfoes = await getAbsolutePathInfoes(substitutionEntry.files, projectRoot, true);
          const itemfiles = itemPathInfoes?.map((p) => p.path);
          newSubstitution.files = itemfiles;
        } else if (files != null) {
          newSubstitution.files = [...files];
        }

        parsedSubstitutions.push(newSubstitution);
      }
    }
  }

  return parsedSubstitutions;
}
