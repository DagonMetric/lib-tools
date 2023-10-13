import { TaskOptions } from './task-options.js';

/**
 * Custom task options.
 */
export interface CustomTaskOptions extends TaskOptions {
    /**
     * Options for this task.
     */
    [option: string]: unknown;
    /**
     * Handler script or module to run this task.
     */
    handler: string;
}
