/**
 * Base task options.
 */
export interface TaskBaseOptions {
    /**
     * Priority order to run.
     */
    priority?: number;
    /**
     * If true, this task will be ignored to run.
     */
    skip?: boolean;
}

/**
 * Overridable task options.
 */
export interface OverridableTaskOptions<TTaskOptions extends TaskBaseOptions> {
    /**
     * To override task options based on env value passed in command line.
     */
    envOverrides?: Record<string, Partial<TTaskOptions>>;
}
