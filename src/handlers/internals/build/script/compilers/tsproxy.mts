/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import * as tsTypes from 'typescript';

export let ts: typeof tsTypes;

export function setTypescriptModule(override: typeof tsTypes) {
    ts = override;
}
