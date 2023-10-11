import { OverridableTaskOptions, TaskBaseOptions } from './task-options.js';

/**
 * Custom task options.
 */
export interface CustomTaskOptions extends TaskBaseOptions {
    /**
     * Handler script or module to run this task.
     */
    handler: string;
    /**
     * Options for custom task.
     */
    options?: Record<string, unknown>;
}

/**
 * Custom task configuration.
 */
export interface CustomTaskConfig extends CustomTaskOptions, OverridableTaskOptions<CustomTaskOptions> {}
