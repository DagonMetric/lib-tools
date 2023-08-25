import { BuildTaskConfig } from './build-task-config.js';
import { ExternalTask } from './task.js';

/**
 * @additionalProperties false
 */
export interface ProjectConfig {
    /**
     * Base project names to inherit from.
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
        [key: string]: ExternalTask | BuildTaskConfig | undefined;
        /**
         * Build task configuration.
         */
        build?: BuildTaskConfig;
    };
}
