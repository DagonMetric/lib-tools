/**
 * Base task options.
 */
export interface Task {
    /**
     * If true, this task will be ignored to run.
     */
    skip?: boolean;
}

/**
 * Overridable task options.
 */
export interface OverridableTaskOptions<TTaskOptions extends Task> {
    /**
     * To override task options based on env value passed in command line.
     */
    envOverrides?: Record<string, Partial<TTaskOptions>>;
}
