/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import { TaskOptions } from './task-options.mjs';

/**
 * Custom task options.
 */
export interface CustomTaskOptions extends TaskOptions {
    /**
     * Options for this task.
     */
    [option: string]: unknown;
    /**
     * Handler script or module to run this task.
     */
    handler: string;
}
