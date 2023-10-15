/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import { CustomTaskOptions } from '../../config-models/index.mjs';
import { findUp, normalizePathToPOSIXStyle } from '../../utils/index.mjs';

import { InvalidConfigError } from '../exceptions/index.mjs';

export async function validateCustomTask(
    customTask: Readonly<CustomTaskOptions>,
    projectInfo: Readonly<{
        workspaceRoot: string;
        projectRoot: string;
        taskName: string;
        projectName?: string | null;
        configPath?: string | null;
    }>
): Promise<void> {
    const { workspaceRoot, projectRoot, configPath, projectName, taskName } = projectInfo;
    const configLocation = projectName
        ? `projects/${projectName}/tasks/${taskName}/handler`
        : `tasks/${taskName}/handler`;

    const handlerStr = customTask.handler.trim();

    if (!handlerStr.length) {
        throw new InvalidConfigError(`The 'handler' must not be empty.`, configPath, configLocation);
    }

    if (handlerStr.toLocaleLowerCase().startsWith('exec:')) {
        if (handlerStr.length < 6) {
            throw new InvalidConfigError('No valid exec command.', configPath, configLocation);
        }
    } else {
        const normalizedPath = normalizePathToPOSIXStyle(handlerStr);
        const foundPath = await findUp(normalizedPath, projectRoot, workspaceRoot, true);

        if (!foundPath) {
            throw new InvalidConfigError(`The handler module doesn't exist.`, configPath, configLocation);
        }
    }
}
