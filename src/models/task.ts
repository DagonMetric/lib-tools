/**
 * @additionalProperties false
 */
export interface Task {
    /**
     * If true, this task will be ignore.
     */
    skip?: boolean;
}

/**
 * @additionalProperties false
 */
export interface ExternalTask extends Task {
    /**
     * Handler module to run this task.
     */
    handler?: string;
}
