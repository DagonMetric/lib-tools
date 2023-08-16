import { ProjectConfig } from './project-config.js';

/**
 * The library workflow configuration.
 * @additionalProperties true
 */
export interface LibConfig {
    /**
     * Link to schema.
     */
    $schema?: string;

    /**
     * The workflow configurations for projects.
     */
    projects: Record<string, ProjectConfig>;
}
