/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import { LibConfig } from '../../config-models/lib-config.mjs';
import { readJsonWithComments } from '../../utils/index.mjs';

import { validateLibConfig } from './validate-lib-config.mjs';

const libConfigCache = new Map<string, LibConfig>();

export async function readLibConfigJsonFile(configPath: string, validate = true): Promise<LibConfig> {
    let libConfig = libConfigCache.get(configPath);
    if (libConfig) {
        return libConfig;
    }

    libConfig = (await readJsonWithComments(configPath)) as LibConfig;

    if (validate) {
        validateLibConfig(libConfig, configPath);
    }

    libConfigCache.set(configPath, libConfig);

    return libConfig;
}
