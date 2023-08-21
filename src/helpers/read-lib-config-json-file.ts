import Ajv from 'ajv';
import ajvFormats from 'ajv-formats';

import { InvalidConfigError } from '../exceptions/index.js';
import { LibConfig } from '../models/index.js';
import { readJsonWithComments } from '../utils/index.js';
import schema from '../schemas/schema.json' assert { type: 'json' };

const ajv = new Ajv.default();
ajvFormats.default(ajv);

const LibConfigSchemaKey = 'LibConfigSchema';

export async function readLibConfigJsonFile(configPath: string, validateSchema: boolean): Promise<LibConfig> {
    const ligConfig = (await readJsonWithComments(configPath)) as LibConfig;

    if (!validateSchema) {
        return ligConfig;
    }

    let validate = ajv.getSchema<LibConfig>(LibConfigSchemaKey);
    if (!validate) {
        ajv.addSchema(schema, LibConfigSchemaKey);
        validate = ajv.getSchema<LibConfig>(LibConfigSchemaKey);
    }

    if (!validate || !validate(ligConfig)) {
        throw new InvalidConfigError(`${ajv.errorsText()}`);
    }

    return ligConfig;
}
