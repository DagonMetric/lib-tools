import { BuildTaskOptions } from './build-task-options.js';
import { OverridableTaskOptions } from './overridable-task-options.js';

/**
 * Build task configuration.
 */
export interface BuildTaskConfig extends BuildTaskOptions, OverridableTaskOptions<BuildTaskOptions> {}
