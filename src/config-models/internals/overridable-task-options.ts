import { TaskOptions } from '../task-options.js';

/**
 * Overridable task options.
 */
export interface OverridableTaskOptions<TTaskOptions extends TaskOptions> {
    /**
     * To override task options based on env value passed in command line.
     */
    envOverrides?: Record<string, Partial<TTaskOptions>>;
}
