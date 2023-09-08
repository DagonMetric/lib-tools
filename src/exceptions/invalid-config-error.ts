import { colors } from '../utils/index.js';

function formatMessage(message: string, configPath: string | null, configLocation: string | null): string {
    let formattedMsg = '';

    if (configPath) {
        formattedMsg += `${colors.cyan(configPath)} - `;
    }

    formattedMsg += colors.red('Configuration error:') + ` ${message}`;

    if (configLocation) {
        formattedMsg += `\n  config location: `;
        formattedMsg += colors.red(configLocation);
    }

    return formattedMsg;
}

export class InvalidConfigError extends Error {
    constructor(message: string, configPath: string | null, configLocation: string | null) {
        super(formatMessage(message, configPath, configLocation));
    }
}
