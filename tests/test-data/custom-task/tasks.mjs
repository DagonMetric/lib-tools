/**
 * @param {{taskName: string}} [task]
 * @param {{logger: { info: (message: string) => void}}} [options]
 */
export function hello(task, options) {
    options.logger.info(`Hello ${task.taskName}`);
}
