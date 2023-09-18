import { CommandOptions } from '../config-models/index.js';
import { colors } from '../utils/index.js';

export class InvalidCommandOptionError extends Error {
    constructor(argName: keyof CommandOptions, argValue: string | null | undefined, message: string | null) {
        super(
            colors.lightRed('Error:') + ' Invalid command argument ' + argValue == null
                ? ''
                : 'value ' + argValue == null
                ? colors.lightRed(`${argName}`)
                : colors.lightRed(`${argName}=${argValue}`) + '. ' + message ?? ''
        );
    }
}
