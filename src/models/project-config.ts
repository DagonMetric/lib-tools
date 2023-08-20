import { BuildTaskConfig } from './build-task-config.js';
import { TestTaskConfig } from './test-task-config.js';

/**
 * @additionalProperties false
 */
export interface ProjectConfig {
    /**
     * Path to base configuration file or name of the base project to inherit from.
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
        /**
         * Build task configuration.
         */
        build?: BuildTaskConfig;
        /**
         * Test task configuration.
         */
        test?: TestTaskConfig;
    };
}
