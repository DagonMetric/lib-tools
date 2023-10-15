/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */

import { CommandOptions } from '../../config-models/index.mjs';
import { colors } from '../../utils/index.mjs';

function formatErrorMessage(
    argName: keyof CommandOptions | null | undefined,
    argValue: string | null | undefined,
    message: string | null | undefined
): string {
    let errMessage = colors.lightRed('Error:');

    if (argName) {
        errMessage += ' Invalid command argument value';

        if (argValue) {
            errMessage += ` ${colors.lightRed(`${argName}=${argValue}`)}.`;
        } else {
            errMessage += ` ${colors.lightRed(`${argName}`)}.`;
        }
    } else {
        errMessage += ' Invalid command argument.';
    }

    errMessage += message ? ` ${message}` : '';

    return errMessage;
}

export class InvalidCommandOptionError extends Error {
    constructor(
        argName: keyof CommandOptions | null | undefined,
        argValue: string | null | undefined,
        message: string | null | undefined
    ) {
        super(formatErrorMessage(argName, argValue, message));
    }
}
