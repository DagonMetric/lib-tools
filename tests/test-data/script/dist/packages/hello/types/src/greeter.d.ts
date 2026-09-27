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
import { Message } from './message';
export declare class Greeter {
    greeting: string;
    constructor(message: Message);
    greet(): string;
}
