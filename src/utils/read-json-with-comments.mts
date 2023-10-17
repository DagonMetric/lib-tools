/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */

import * as fs from 'node:fs/promises';

import { stripComments } from './strip-comments.mjs';

export async function readJsonWithComments(filePath: string): Promise<unknown> {
    const content = await fs.readFile(filePath, { encoding: 'utf-8' });
    const contentWithNoComments = stripComments(content.replace(/^\uFEFF/, ''));

    return JSON.parse(contentWithNoComments) as unknown;
}
