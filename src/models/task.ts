/**
 * @additionalProperties false
 */
export interface Task {
    /**
     * Handler module to run this task.
     */
    handler?: string;
    /**
     * If true, this task will be ignore.
     */
    skip?: boolean;
}
