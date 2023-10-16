/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import Ajv, { Schema } from 'ajv';

import { LibConfig } from '../../config-models/lib-config.mjs';
import schema from '../../schemas/schema.json' assert { type: 'json' };

import { ConfigSchemaValidationError } from '../exceptions/index.mjs';

const ajv = new Ajv.default({ allErrors: true, allowUnionTypes: true });

const validate = ajv.compile(schema as Schema);

export function validateLibConfig(libConfig: LibConfig, configPath: string | null = null): void {
    const valid = validate(libConfig);

    if (!valid) {
        throw new ConfigSchemaValidationError(validate.errors ?? [], configPath);
    }
}
