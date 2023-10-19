/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import * as path from 'node:path';

import { isSamePath } from '../../../../../utils/index.mjs';

import { CompileOptions } from './compile-interfaces.mjs';

export function getEntryOutFileInfo(
    currentOutFilePath: string,
    outBase: string,
    options: CompileOptions,
    fromEntryFileName: boolean
): { isEntry: boolean; outFilePath: string } {
    if (!options.entryPoints) {
        return {
            isEntry: false,
            outFilePath: currentOutFilePath
        };
    }

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

    for (const [outName, entryFilePath] of Object.entries(options.entryPoints)) {
        const entryFileName = path.basename(entryFilePath);
        const entryNameWithoutExt = entryFileName.substring(
            0,
            entryFileName.length - path.extname(entryFileName).length
        );

        const preferredOutPathWiithoutExt = path.resolve(options.outDir, outBase, outName);
        const testPathWithoutExt = path.resolve(
            options.outDir,
            outBase,
            fromEntryFileName ? entryNameWithoutExt : outName
        );

        if (isSamePath(currentOutFilePathWithoutExt, testPathWithoutExt)) {
            return {
                isEntry: currentOutLastExtName.toLowerCase() !== '.map' ? true : false,
                outFilePath: `${preferredOutPathWiithoutExt}${currentOutSecondLastExtName}${currentOutLastExtName}`
            };
        }
    }

    return {
        isEntry: false,
        outFilePath: currentOutFilePath
    };
}
