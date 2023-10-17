/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { TaskOptions } from '../config-models/index.mjs';

import { TaskInfo } from './task-info.mjs';

export interface CustomTask extends Omit<TaskOptions, 'skip'>, TaskInfo {
    [option: string]: unknown;
    readonly taskCategory: 'custom';
    readonly handler: string;
}
