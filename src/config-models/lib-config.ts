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
     * Project configuration collection.
     */
    projects: Record<string, Project>;
}
