import { Project } from './project.js';

/**
 * Library workflow configuration.
 */
export interface LibConfig {
    /**
     * Link to schema file.
     */
    $schema?: string;
    /**
     * Project configurations.
     */
    projects: Record<string, Project>;
}
