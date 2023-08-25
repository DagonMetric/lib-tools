/**
 * @additionalProperties false
 */
export interface TaskBase {
    /**
     * The description of the task to display.
     */
    description?: string;
    /**
     * Handler module to run this task.
     */
    handler?: string;
    /**
     * If true, this task will be ignore.
     */
    skip?: boolean;
}
