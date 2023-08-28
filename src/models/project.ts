import { BuildTask } from './build-task.js';
import { Task } from './task.js';

/**
 * @additionalProperties false
 */
export interface Project {
    /**
     * Base project name to inherit from.
     */
    extends?: string;

    /**
     * Root folder of the project files.
     */
    root?: string;

    /**
     * The task configurations.
     */
    tasks?: {
        [key: string]: Task | undefined;
        /**
         * Build task configuration.
         */
        build?: BuildTask;
    };
}
