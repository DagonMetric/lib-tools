import Ajv, { Schema } from 'ajv';

import { LibConfig } from '../../config-models/index.js';
import { ConfigSchemaValidationError } from '../../exceptions/index.js';

import schema from '../../schemas/schema.json' assert { type: 'json' };

const ajv = new Ajv.default({ allErrors: true, allowUnionTypes: true });

const validate = ajv.compile(schema as Schema);

export function validateLibConfig(libConfig: LibConfig, configPath: string | null = null): void {
    const valid = validate(libConfig);

    if (!valid) {
        throw new ConfigSchemaValidationError(validate.errors ?? [], configPath);
    }
}
