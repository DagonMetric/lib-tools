import Ajv, { Schema } from 'ajv';

import { LibConfig } from '../config-models/index.js';
import { ConfigSchemaValidationError } from '../exceptions/index.js';
import schema from '../schemas/schema.json' assert { type: 'json' };
import { readJsonWithComments } from '../utils/index.js';

const ajv = new Ajv.default({ allErrors: true, allowUnionTypes: true });

const libConfigCache = new Map<string, LibConfig>();

export async function readLibConfigJsonFile(configPath: string, configSchema: Schema = schema): Promise<LibConfig> {
    let libConfig = libConfigCache.get(configPath);
    if (libConfig) {
        return libConfig;
    }

    libConfig = (await readJsonWithComments(configPath)) as LibConfig;

    const validate = ajv.compile(configSchema);

    const valid = validate(libConfig);

    if (!valid) {
        throw new ConfigSchemaValidationError(validate.errors ?? [], configPath);
    }

    libConfigCache.set(configPath, libConfig);

    return libConfig;
}
