/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BannerOptions, SubstitutionEntry } from '../../config-models/index.mjs';
import { findUp } from '../../utils/index.mjs';

import { BuildTask } from '../build-task.mjs';
import { InvalidConfigError } from '../exceptions/index.mjs';

import { ParsedBannerOptions } from './parsed-banner-options.mjs';

const commentEndRegExp = /\*\//g;
const regExpEscapePattern = /[.*+?^${}()|[\]\\]/g;
const bannerTextCache = new Map<string, string>();

async function readFileUp(searchFileNames: string[], startDir: string, endDir: string): Promise<string | undefined> {
    const cacheKey = `${startDir}!${endDir}!${searchFileNames.join('!')}`;
    const cached = bannerTextCache.get(cacheKey);
    if (cached != null) {
        if (cached.length > 0) {
            return cached;
        }

        return undefined;
    }

    let content: string | undefined;

    for (const searchFile of searchFileNames) {
        const foundPath = await findUp(searchFile, startDir, endDir, true);
        if (foundPath) {
            content = await fs.readFile(foundPath, 'utf-8');
            content = content.trim();

            break;
        }
    }

    if (content) {
        bannerTextCache.set(cacheKey, content);
    } else {
        bannerTextCache.set(cacheKey, '');
    }

    return content;
}

function wrapComment(str: string, location: 'banner' | 'footer') {
    if (str.startsWith('//') || str.startsWith('/*')) {
        return str;
    }

    if (location === 'footer') {
        const lines = str.split(/[\n\r]/);
        const lastLine = lines[lines.length - 1];
        if (str.endsWith('*/') || lastLine.startsWith('//') || lastLine.startsWith('/*')) {
            return str;
        }
    }

    if (!str.includes('\n')) {
        return `/*! ${str.replace(commentEndRegExp, '* /')} */`;
    }
    return `/*!\n * ${str.replace(/\*\//g, '* /').split('\n').join('\n * ').replace(/\s+\n/g, '\n').trimEnd()}\n */`;
}

function applySubstitutions(str: string, substitutions: readonly SubstitutionEntry[]): string {
    for (const substitution of substitutions) {
        const escapedPattern = substitution.searchValue.replace(regExpEscapePattern, '\\$&'); // $& means the whole matched string
        const searchRegExp = new RegExp(
            `${substitution.startDelimiter ?? '\\b'}${escapedPattern}${substitution.endDelimiter ?? '\\b(?!\\.)'}`,
            'g'
        );
        str = str.replace(searchRegExp, substitution.replaceValue);
    }

    return str;
}

async function getBannerOptionsCore(
    location: 'banner' | 'footer',
    bannerFor: 'script' | 'style',
    banner: boolean | string | undefined,
    include: readonly string[] | undefined,
    exclude: readonly string[] | undefined,
    buildTask: Readonly<BuildTask>,
    substitutions: readonly SubstitutionEntry[],
    configLocationSuffix?: string
): Promise<ParsedBannerOptions | undefined> {
    if (!banner) {
        return undefined;
    }

    const { workspaceRoot, projectRoot, projectName, taskName, configPath } = buildTask;

    const taskLocation = `tasks/${taskName}/${bannerFor}/${location}${
        configLocationSuffix ? `/${configLocationSuffix}` : ''
    }`;
    const configLocation = projectName ? `projects/${projectName}/${taskLocation}` : taskLocation;

    const searchFiles = [
        `${location}.${bannerFor}.md`,
        `${location}.${bannerFor}.txt`,
        `${location}.md`,
        `${location}.txt`
    ];

    let bannerText: string | undefined;

    if (
        banner === true ||
        (typeof banner === 'string' &&
            (banner.trim().toLowerCase() === 'true' || banner.trim().toLowerCase() === 'auto'))
    ) {
        bannerText = await readFileUp(searchFiles, projectRoot, workspaceRoot);

        if (!bannerText) {
            throw new InvalidConfigError(
                `${
                    location === 'footer' ? 'Footer' : 'Banner'
                } file could not be detected automatically. Specify ${location} file path manually.`,
                configPath,
                `${configLocation}`
            );
        }
    } else {
        const trimedInput = banner.trim();

        if (
            !trimedInput.startsWith('//') &&
            !trimedInput.startsWith('/*') &&
            !trimedInput.endsWith('*/') &&
            !/[\n\r\t\s:*?"]/.test(trimedInput) &&
            trimedInput.length <= 4096
        ) {
            bannerText = await readFileUp([trimedInput], projectRoot, workspaceRoot);

            if (!bannerText) {
                if (
                    path.extname(trimedInput).toLowerCase() === '.md' ||
                    path.extname(trimedInput).toLowerCase() === '.txt'
                ) {
                    throw new InvalidConfigError(
                        `${location === 'footer' ? 'Footer' : 'Banner'} file could not be found.`,
                        configPath,
                        `${configLocation}`
                    );
                } else {
                    bannerText = trimedInput;
                }
            }
        } else {
            bannerText = trimedInput;
        }
    }

    if (!bannerText) {
        return undefined;
    }

    bannerText = wrapComment(bannerText, location);
    bannerText = applySubstitutions(bannerText, substitutions);

    return {
        text: bannerText,
        include,
        exclude
    };
}

export async function getBannerOptions(
    location: 'banner' | 'footer',
    bannerFor: 'script' | 'style',
    banner: boolean | string | Readonly<BannerOptions> | undefined,
    buildTask: Readonly<BuildTask>,
    substitutions: readonly SubstitutionEntry[]
): Promise<ParsedBannerOptions | undefined> {
    if (!banner) {
        return undefined;
    }

    if (typeof banner === 'object') {
        const inputOptions = banner;

        if (inputOptions.entry) {
            return getBannerOptionsCore(
                location,
                bannerFor,
                inputOptions.entry,
                inputOptions.include,
                inputOptions.exclude,
                buildTask,
                substitutions,
                'entry'
            );
        } else {
            return undefined;
        }
    } else {
        return getBannerOptionsCore(
            location,
            bannerFor,
            banner,
            undefined,
            undefined,
            buildTask,
            substitutions,
            undefined
        );
    }
}
