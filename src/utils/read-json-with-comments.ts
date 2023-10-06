import * as fs from 'node:fs/promises';

import { stripComments } from './strip-comments.js';

export async function readJsonWithComments(filePath: string): Promise<unknown> {
    const content = await fs.readFile(filePath, { encoding: 'utf-8' });
    const contentWithNoComments = stripComments(content.toString().replace(/^\uFEFF/, ''));

    return JSON.parse(contentWithNoComments) as unknown;
}
