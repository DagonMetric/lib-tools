import { OverridableTaskOptions, Task } from './task.js';

/**
 * @additionalProperties false
 */
export interface CustomTask extends OverridableTaskOptions<Task>, Task {
    /**
     * Handler script or module to run this task.
     */
    handler: string;
    /**
     * Options for task.
     */
    options?: Record<string, unknown>;
}
