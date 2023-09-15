import { colors } from '../utils/index.js';

function formatMessage(message: string, configPath: string | null, configLocation: string | null): string {
    let formattedMsg = '';

    if (configPath) {
        formattedMsg += `${colors.lightCyan(configPath)} - `;
    }

    formattedMsg += colors.lightRed('Configuration error:') + ` ${message}`;

    if (configLocation) {
        formattedMsg += `\n  config location: `;
        formattedMsg += colors.lightRed(configLocation);
    }

    return formattedMsg;
}

export class InvalidConfigError extends Error {
    constructor(message: string, configPath: string | null, configLocation: string | null) {
        super(formatMessage(message, configPath, configLocation));
    }
}
