/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import Ajv, { Options } from 'ajv';
import type * as ajvTypes from 'ajv';

import { LibConfig } from '../../config-models/lib-config.mjs';
import schema from '../../schemas/schema.json' assert { type: 'json' };

import { ConfigSchemaValidationError } from '../exceptions/index.mjs';

const ajvOptions: Options = { allErrors: true, allowUnionTypes: true };
const ajv =
    'default' in Ajv && typeof Ajv.default === 'function'
        ? // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          (new (Ajv as any).default(ajvOptions) as ajvTypes.default)
        : // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
          (new (Ajv as any)(ajvOptions) as ajvTypes.default);

const validate = ajv.compile(schema);

export function validateLibConfig(libConfig: LibConfig, configPath: string | null = null): void {
    const valid = validate(libConfig);

    if (!valid) {
        throw new ConfigSchemaValidationError(validate.errors ?? [], configPath);
    }
}
