import { OverridableTaskOptions, Task } from './task.js';

/**
 * @additionalProperties false
 */
export interface ExternalTask extends OverridableTaskOptions<Task>, Task {
    /**
     * Handler script or module to run this task.
     */
    handler: string;
}
