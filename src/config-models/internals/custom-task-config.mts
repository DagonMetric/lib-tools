/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import { CustomTaskOptions } from '../custom-task-options.mjs';

import { OverridableTaskOptions } from './overridable-task-options.mjs';

/**
 * Custom task configuration.
 */
export interface CustomTaskConfig extends CustomTaskOptions, OverridableTaskOptions<CustomTaskOptions> {}
