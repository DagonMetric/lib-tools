/* eslint-disable no-console */
import { Message } from './message';
import { simpleDecorator } from './simple-decorator';

export class Greeter {
    greeting: string;

    constructor(message: Message) {
        this.greeting = message.text;
    }

    @simpleDecorator('greet')
    greet(): string {
        return 'Hello, ' + this.greeting;
    }
}
