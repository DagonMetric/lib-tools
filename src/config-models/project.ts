import { BuildTask } from './build-task.js';
import { CustomTask } from './custom-task.js';

/**
 * Project configuration options.
 */
export interface Project {
    /**
     * Base project name to inherit from.
     */
    extends?: string;
    /**
     * Root directory of this project.
     */
    root?: string;
    /**
     * Task configuration collection.
     */
    tasks?: Record<string, CustomTask> & {
        /**
         * Build task options.
         */
        build?: BuildTask;
    };
}
