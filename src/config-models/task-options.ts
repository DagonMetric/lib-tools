/**
 * Base task options.
 */
export interface TaskOptions {
    /**
     * Priority order to run.
     */
    priority?: number;
    /**
     * If true, this task will be ignored to run.
     */
    skip?: boolean;
}
