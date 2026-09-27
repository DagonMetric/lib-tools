/* !
 * @license
 * Copyright 2023 DagonMetric All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools.
 * project name: hello
 * package name: hello
 * package version: 1.0.0
 * home page: https://github.com/dagonmetric/lib-tools
 * description: This is a hello package.
 */
import { __decorate, __metadata } from 'tslib';

const id = 1;
const text = "Data!";
const data = {
	id,
	text
};

 
function simpleDecorator(key) {
    // eslint-disable-next-line no-console
    console.log('evaluate: ', key);
    return function () {
        // eslint-disable-next-line no-console
        console.log('call: ', key);
    };
}

class Greeter {
    greeting;
    constructor(message) {
        this.greeting = message.text;
    }
    greet() {
        return 'Hello, ' + this.greeting;
    }
}
__decorate([
    simpleDecorator('greet'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", String)
], Greeter.prototype, "greet", null);

const VERSION = '1.0.0';
/**
 * sayHello function.
 */
function sayHello() {
    const message = data;
    const greeter = new Greeter(message);
    greeter.greet();
}

/**
 * @module
 * @description
 * Entry point for all public APIs of this package.
 */
// This file only reexports content of the `src` folder. Keep it that way.

export { Greeter, VERSION, sayHello, simpleDecorator };
// This ia a footer text.
// # sourceMappingURL=hello.js.map
