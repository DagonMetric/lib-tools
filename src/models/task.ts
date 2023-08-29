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

export interface OverridableTaskOptions<TTaskOptions extends Task> {
    /**
     * To override task options based on env value passed in command line.
     */
    envOverrides?: Record<string, Partial<TTaskOptions>>;
}
