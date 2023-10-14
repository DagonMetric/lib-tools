import Ajv, { Schema } from 'ajv';

import { LibConfig } from '../../config-models/internals/index.js';
import schema from '../../schemas/schema.json' assert { type: 'json' };

import { ConfigSchemaValidationError } from '../exceptions/index.js';

const ajv = new Ajv.default({ allErrors: true, allowUnionTypes: true });

const validate = ajv.compile(schema as Schema);

/**
 * @internal
 */
export function validateLibConfig(libConfig: LibConfig, configPath: string | null = null): void {
    const valid = validate(libConfig);

    if (!valid) {
        throw new ConfigSchemaValidationError(validate.errors ?? [], configPath);
    }
}
