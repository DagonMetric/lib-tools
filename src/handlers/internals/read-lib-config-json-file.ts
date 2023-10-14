import { LibConfig } from '../../config-models/internals/index.js';
import { readJsonWithComments } from '../../utils/index.js';

import { validateLibConfig } from './validate-lib-config.js';

const libConfigCache = new Map<string, LibConfig>();

/**
 * @internal
 */
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
