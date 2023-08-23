import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { findUp } from '../utils/index.js';

function addCommentToBanner(banner: string): string {
    if (banner.trim().startsWith('/')) {
        return banner;
    }

    const commentLines: string[] = [];
    const bannerLines = banner.split('\n');
    for (let i = 0; i < bannerLines.length; i++) {
        if (bannerLines[i] === '' || bannerLines[i] === '\r') {
            continue;
        }

        const bannerText = bannerLines[i].trim();
        if (i === 0) {
            commentLines.push('/**');
        }
        commentLines.push(` * ${bannerText}`);
    }
    commentLines.push(' */');
    banner = commentLines.join('\n');

    return banner;
}

export async function getBannerText(config: {
    banner: string | undefined;
    projectRoot: string;
    workspaceRoot: string;
    packageName: string | null | undefined;
    packageVersion: string | null | undefined;
    configLocationPrefix: string | null;
}): Promise<string | null> {
    const { banner, projectRoot, workspaceRoot, packageName, packageVersion, configLocationPrefix } = config;

    if (!banner?.trim().length) {
        return null;
    }

    let bannerText = banner.trim();

    if (/\.txt$/i.test(bannerText)) {
        const bannerFilePath = await findUp(bannerText, projectRoot, workspaceRoot);
        if (bannerFilePath) {
            bannerText = await fs.readFile(bannerFilePath, 'utf-8');
        } else {
            throw new InvalidConfigError(
                `The banner file: ${path.resolve(projectRoot, bannerText)} doesn't exist.`,
                `${configLocationPrefix}.banner`
            );
        }
    }

    bannerText = addCommentToBanner(bannerText);
    bannerText = bannerText.replace(/[$|[]CURRENT[_-]?YEAR[$|\]]/gim, new Date().getFullYear().toString());

    if (packageName) {
        bannerText = bannerText.replace(/[$|[](PROJECT|PACKAGE)[_-]?NAME[$|\]]/gim, packageName);
    }

    if (packageVersion) {
        bannerText = bannerText.replace(/[$|[](PROJECT|PACKAGE)?[_-]?VERSION[$|\]]/gim, packageVersion);
        bannerText = bannerText.replace(/0\.0\.0-PLACEHOLDER/i, packageVersion);
    }

    return bannerText;
}
