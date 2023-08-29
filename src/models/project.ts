import { BuildTask } from './build-task.js';
import { ExternalTask } from './external-task.js';

export interface BuildAndExternalTask {
    [key: string]: BuildTask | ExternalTask | undefined;
    build?: BuildTask;
}

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
        [Property in keyof BuildAndExternalTask]: Property extends 'build' ? BuildTask : ExternalTask;
    };
}
