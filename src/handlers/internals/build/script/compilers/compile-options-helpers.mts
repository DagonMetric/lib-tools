/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import * as path from 'node:path';

import { isSamePath, normalizePathToPOSIXStyle } from '../../../../../utils/index.mjs';

export function getEntryOutFileInfo(options: {
    currentOutFilePath: string;
    outDir: string;
    entryPoints: string[] | Record<string, string>;
    projectRoot: string;
    entryRoot: string | undefined;
}): { isEntry: boolean; outFilePath: string } {
    const { currentOutFilePath, entryPoints, outDir, projectRoot, entryRoot } = options;

    const currentOutLastExtName = path.extname(currentOutFilePath);
    let currentOutFilePathWithoutExt = currentOutFilePath.substring(
        0,
        currentOutFilePath.length - currentOutLastExtName.length
    );

    let currentOutSecondLastExtName = '';
    if (currentOutLastExtName.toLowerCase() === '.map' || /\.d$/i.test(currentOutFilePathWithoutExt)) {
        currentOutSecondLastExtName = path.extname(currentOutFilePathWithoutExt);
        currentOutFilePathWithoutExt = currentOutFilePathWithoutExt.substring(
            0,
            currentOutFilePathWithoutExt.length - currentOutSecondLastExtName.length
        );
    }

    for (const [index, entryFilePath] of Object.entries(entryPoints)) {
        const entryFileName = path.basename(entryFilePath);
        const entryNameWithoutExt = entryFileName.substring(
            0,
            entryFileName.length - path.extname(entryFileName).length
        );
        const entryPathRelToEntryRoot = normalizePathToPOSIXStyle(
            path.relative(entryRoot ?? projectRoot, entryFilePath)
        );
        const subDirPath =
            entryPathRelToEntryRoot.length > entryFileName.length
                ? entryPathRelToEntryRoot.substring(0, entryPathRelToEntryRoot.length - entryFileName.length)
                : '';

        const outName = Array.isArray(entryPoints) ? entryNameWithoutExt : index;

        const testPathWithoutExt = path.resolve(outDir, subDirPath, outName);

        if (isSamePath(currentOutFilePathWithoutExt, testPathWithoutExt)) {
            return {
                isEntry: currentOutLastExtName.toLowerCase() !== '.map' ? true : false,
                outFilePath: `${testPathWithoutExt}${currentOutSecondLastExtName}${currentOutLastExtName}`
            };
        }
    }

    return {
        isEntry: false,
        outFilePath: currentOutFilePath
    };
}
