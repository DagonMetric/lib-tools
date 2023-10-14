import { CustomTaskOptions } from '../custom-task-options.js';

import { OverridableTaskOptions } from './overridable-task-options.js';

/**
 * Custom task configuration.
 */
export interface CustomTaskConfig extends CustomTaskOptions, OverridableTaskOptions<CustomTaskOptions> {}
