// Banner
import { Message } from './message';

export const VERSION = '0.0.0-PLACEHOLDER';

/**
 * sayHello function.
 * @param message Message object.
 */
export function sayHello(message: Message) {
    // eslint-disable-next-line no-console
    console.log(message.text);
}
