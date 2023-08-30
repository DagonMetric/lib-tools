/**
 * @param {Record<string,unknown>} [task]
 * @param {{ info: (message: string) => void }} [logger]
 */
export function hello(task, logger) {
    if (task) {
        logger.info('Hello!');
    }
}
