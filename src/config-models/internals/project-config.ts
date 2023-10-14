import { BuildTaskConfig } from './build-task-config.js';
import { CustomTaskConfig } from './custom-task-config.js';

/**
 * Project configuration.
 */
export interface ProjectConfig {
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
    tasks?: Record<string, CustomTaskConfig> & {
        /**
         * Build task configuration.
         */
        build?: BuildTaskConfig;
    };
}
