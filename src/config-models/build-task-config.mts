/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import { BuildTaskOptions } from './build-task-options.mjs';
import { OverridableTaskOptions } from './overridable-task-options.mjs';

/**
 * Build task configuration.
 */
export interface BuildTaskConfig extends BuildTaskOptions, OverridableTaskOptions<BuildTaskOptions> {}
