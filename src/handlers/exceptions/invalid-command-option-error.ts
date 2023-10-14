import { CommandOptions } from '../../config-models/index.js';
import { colors } from '../../utils/index.js';

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
