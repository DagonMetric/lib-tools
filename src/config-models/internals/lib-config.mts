/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import { ProjectConfig } from './project-config.mjs';

/**
 * Library workflow configuration.
 */
export interface LibConfig {
    /**
     * Link to schema file.
     */
    $schema?: string;
    /**
     * Project configuration collection.
     */
    projects: Record<string, ProjectConfig>;
}
