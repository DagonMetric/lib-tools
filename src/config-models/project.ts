import { BuildTask } from './build-task.js';
import { CustomTask } from './custom-task.js';

/**
 * Project configuration options.
 * @additionalProperties false
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
     * Task configurations.
     */
    tasks: {
        [Property in keyof Record<string, CustomTask> as Exclude<Property, 'build'>]: CustomTask;
    } & {
        /**
         * Build task configuration.
         */
        build?: BuildTask;
    };
}
