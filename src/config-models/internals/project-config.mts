/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import { BuildTaskConfig } from './build-task-config.mjs';
import { CustomTaskConfig } from './custom-task-config.mjs';

/**
 * Project configuration.
 */
export interface ProjectConfig {
    /**
     * Base project name to inherit from.
     */
    extends?: string;
    /**
     * Root directory of this project.
     */
    root?: string;
    /**
     * Task configuration collection.
     */
    tasks?: Record<string, CustomTaskConfig> & {
        /**
         * Build task configuration.
         */
        build?: BuildTaskConfig;
    };
}
