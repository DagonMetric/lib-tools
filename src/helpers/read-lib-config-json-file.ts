import Ajv from 'ajv';
import ajvFormats from 'ajv-formats';

import { SchemaValidationError } from '../exceptions/index.js';
import { LibConfig } from '../models/index.js';
import schema from '../schemas/schema.json' assert { type: 'json' };
import { readJsonWithComments } from '../utils/index.js';

const ajv = new Ajv.default();
ajvFormats.default(ajv);

const LibConfigSchemaKey = 'LibConfigSchema';

const libConfigCache = new Map<string, LibConfig>();

export async function readLibConfigJsonFile(configPath: string): Promise<LibConfig> {
    let libConfig = libConfigCache.get(configPath);
    if (libConfig) {
        return libConfig;
    }

    libConfig = (await readJsonWithComments(configPath)) as LibConfig;

    let validate = ajv.getSchema<LibConfig>(LibConfigSchemaKey);
    if (!validate) {
        ajv.addSchema(schema, LibConfigSchemaKey);
        validate = ajv.getSchema<LibConfig>(LibConfigSchemaKey);
    }

    if (!validate || !validate(libConfig)) {
        throw new SchemaValidationError(`${ajv.errorsText()}`);
    }

    libConfigCache.set(configPath, libConfig);

    return libConfig;
}
