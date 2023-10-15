/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import { TaskOptions } from '../task-options.mjs';

/**
 * Overridable task options.
 */
export interface OverridableTaskOptions<TTaskOptions extends TaskOptions> {
    /**
     * To override task options based on env value passed in command line.
     */
    envOverrides?: Record<string, Partial<TTaskOptions>>;
}
