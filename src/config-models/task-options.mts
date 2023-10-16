/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
/**
 * Base task options.
 */
export interface TaskOptions {
    /**
     * Priority order to run.
     */
    priority?: number;
    /**
     * If true, this task will be ignored to run.
     */
    skip?: boolean;
}
