import { Message } from './message';
import { Person } from './person';

export const VERSION = '0.0.0-PLACEHOLDER';

/**
 * sayHello function.
 * @param message Message object.
 */
export function sayHello(message: Message) {
    const person = new Person(message);
    person.greet();
}
