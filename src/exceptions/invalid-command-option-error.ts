import { colors } from '../utils/index.js';

export class InvalidCommandOptionError extends Error {
    constructor(message: string, cmdArg: string) {
        super(
            colors.lightRed('Error:') +
                " Invalid command argument value - '" +
                colors.lightRed(cmdArg) +
                "'. " +
                message
        );
    }
}
