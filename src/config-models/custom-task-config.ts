import { OverridableTaskOptions, TaskBaseOptions } from './task-options.js';

/**
 * Custom task options.
 */
export interface CustomTaskOptions extends TaskBaseOptions {
    /**
     * Options for this task.
     */
    [option: string]: unknown;
    /**
     * Handler script or module to run this task.
     */
    handler: string;
}

/**
 * Custom task configuration.
 */
export interface CustomTaskConfig extends CustomTaskOptions, OverridableTaskOptions<CustomTaskOptions> {}
