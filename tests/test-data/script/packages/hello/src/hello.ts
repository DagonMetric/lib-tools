import { Greeter } from './greeter';
import { Message } from './message';

export const VERSION = '0.0.0-PLACEHOLDER';

export * from './message';
export * from './greeter';
export * from './simple-decorator';

/**
 * sayHello function.
 * @param message Message object.
 */
export function sayHello(message: Message) {
    const greeter = new Greeter(message);
    greeter.greet();
}
