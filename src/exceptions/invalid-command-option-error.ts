import { colors } from '../utils/index.js';

export class InvalidCommandOptionError extends Error {
    constructor(message: string, cmdArg: string) {
        super('Invalid command options - ' + colors.red(cmdArg) + '. ' + message);
    }
}
