/**
 * @additionalProperties false
 */
export interface TaskBase {
    /**
     * The description of the task to display.
     */
    description?: string;
    /**
     * A list of task names that must have been run before.
     */
    dependOn?: string[];
    /**
     * Handler module to run this task.
     */
    handler?: string;
    /**
     * If true, this task will be ignore.
     */
    skip?: boolean;
}
