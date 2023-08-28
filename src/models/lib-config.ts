import { Project } from './project.js';

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
     * The project configurations.
     */
    projects: Record<string, Project>;
}
