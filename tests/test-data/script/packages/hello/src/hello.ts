import data from './data.json' assert { type: 'json' };

import { Greeter } from './greeter';
import { Message } from './message';

export const VERSION = '0.0.0-PLACEHOLDER';

export * from './message';
export * from './greeter';
export * from './simple-decorator';

/**
 * sayHello function.
 */
export function sayHello() {
    const message: Message = data;
    const greeter = new Greeter(message);
    greeter.greet();
}
