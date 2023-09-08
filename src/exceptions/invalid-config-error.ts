import { colors } from '../utils/index.js';

function formatMessage(message: string, configFile: string | null, configLocation: string | null): string {
    let formattedMsg = '';

    if (configFile) {
        formattedMsg += `${colors.cyan(configFile)} - `;
    }

    formattedMsg += colors.red('Configuration error:') + ` ${message}`;

    if (configLocation) {
        formattedMsg += `\n  config location: `;
        formattedMsg += colors.red(configLocation);
    }

    return formattedMsg;
}

export class InvalidConfigError extends Error {
    constructor(message: string, configFile: string | null, configLocation: string | null) {
        super(formatMessage(message, configFile, configLocation));
    }
}
