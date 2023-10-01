/* eslint-disable no-console */
import { loggedMethod } from './logged-method';
import { Message } from './message';

export class Person {
    message: Message;
    constructor(message: Message) {
        this.message = message;
    }

    @loggedMethod
    greet() {
        console.log(`Hello, ${this.message.text}.`);
    }
}
