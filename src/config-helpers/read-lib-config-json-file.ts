import Ajv from 'ajv';

import { SchemaValidationError } from '../exceptions/index.js';
import { LibConfig } from '../models/index.js';
import schema from '../schemas/schema.json' assert { type: 'json' };
import { readJsonWithComments } from '../utils/index.js';

const ajv = new Ajv.default({ allErrors: true });

const libConfigCache = new Map<string, LibConfig>();

export async function readLibConfigJsonFile(configPath: string): Promise<LibConfig> {
    let libConfig = libConfigCache.get(configPath);
    if (libConfig) {
        return libConfig;
    }

    libConfig = (await readJsonWithComments(configPath)) as LibConfig;

    const validate = ajv.compile(schema);

    const valid = validate(libConfig);

    if (!valid) {
        throw new SchemaValidationError(validate.errors ?? [], configPath);
    }

    libConfigCache.set(configPath, libConfig);

    return libConfig;
}
