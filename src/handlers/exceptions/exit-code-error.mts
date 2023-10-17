/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */

export class ExitCodeError extends Error {
    constructor(
        public exitCode: number,
        public reason?: unknown
    ) {
        super(`Process was existed with code ${exitCode}.`);
    }
}
