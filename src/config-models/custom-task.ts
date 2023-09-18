import { OverridableTaskOptions, Task } from './task.js';

/**
 * Custom task options.
 */
export interface CustomTaskOptions extends Task {
    /**
     * Handler script or module to run this task.
     */
    handler: string;
    /**
     * Options for task.
     */
    options?: Record<string, unknown>;
}

/**
 * Custom task options.
 */
export interface CustomTask extends CustomTaskOptions, OverridableTaskOptions<CustomTaskOptions> {}
