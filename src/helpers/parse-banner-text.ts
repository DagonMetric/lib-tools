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

export function parseBannerText(config: {
    banner: string;
    packageName: string | null | undefined;
    packageVersion: string | null | undefined;
}): string {
    const { banner, packageName, packageVersion } = config;

    let bannerText = addCommentToBanner(banner);

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
