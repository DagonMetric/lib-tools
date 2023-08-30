import { BuildTask } from './build-task.js';
import { ExternalTask } from './external-task.js';

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
        [Property in keyof Record<string, ExternalTask> as Exclude<Property, 'build'>]: ExternalTask;
    } & {
        /**
         * Build task configuration.
         */
        build?: BuildTask;
    };
}
