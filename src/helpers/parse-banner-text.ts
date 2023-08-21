import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { InvalidConfigError } from '../exceptions/index.js';
import { ParsedBuildTaskConfig } from '../models/index.js';
import { findUp } from '../utils/index.js';

export async function parseBannerText(buildTaskConfig: ParsedBuildTaskConfig): Promise<void> {
    if (!buildTaskConfig.banner) {
        return;
    }

    let bannerText = buildTaskConfig.banner;

    if (/\.txt$/i.test(bannerText)) {
        const bannerFilePath = await findUp(bannerText, buildTaskConfig._projectRoot, buildTaskConfig._workspaceRoot);
        if (bannerFilePath) {
            bannerText = await fs.readFile(bannerFilePath, 'utf-8');
        } else {
            throw new InvalidConfigError(
                `The banner text file: ${path.resolve(
                    buildTaskConfig._projectRoot,
                    bannerText
                )} doesn't exist. Correct value in 'projects[${buildTaskConfig._projectName}].build.banner'.`
            );
        }
    }

    if (!bannerText) {
        return;
    }

    bannerText = addCommentToBanner(bannerText);
    bannerText = bannerText.replace(/[$|[]CURRENT[_-]?YEAR[$|\]]/gim, new Date().getFullYear().toString());
    if (buildTaskConfig.packageJson) {
        const packageJson = buildTaskConfig._packageJson!;

        bannerText = bannerText.replace(/[$|[](PROJECT|PACKAGE)[_-]?NAME[$|\]]/gim, packageJson._packageName);

        if (packageJson._packageVersion) {
            bannerText = bannerText.replace(
                /[$|[](PROJECT|PACKAGE)?[_-]?VERSION[$|\]]/gim,
                packageJson._packageVersion
            );
            bannerText = bannerText.replace(/0\.0\.0-PLACEHOLDER/i, packageJson._packageVersion);
        }
    }

    buildTaskConfig._bannerText = bannerText;
}

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
