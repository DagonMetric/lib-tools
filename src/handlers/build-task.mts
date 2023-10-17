/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { BuildTaskOptions } from '../config-models/index.mjs';

import { TaskInfo } from './task-info.mjs';

export interface BuildTask extends Omit<BuildTaskOptions, 'skip'>, TaskInfo {
    readonly taskCategory: 'build';
    readonly taskName: 'build';
    readonly outDir: string;
}
