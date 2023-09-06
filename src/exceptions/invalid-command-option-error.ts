import { colors } from '../utils/index.js';

export class InvalidCommandOptionError extends Error {
    constructor(message: string, cmdArg: string) {
        super(colors.red('Error:') + " Invalid command argument value - '" + colors.red(cmdArg) + "'. " + message);
    }
}
