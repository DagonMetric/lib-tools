/**
 * @param {{logger: { info: (message: string) => void}}} [context]
 */
export function hello(context) {
    context.logger.info('Hello!');
}
