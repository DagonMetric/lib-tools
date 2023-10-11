import { colors } from '../utils/index.js';

function formatMessage(
    message: string,
    configPath: string | null | undefined,
    configLocation: string | null | undefined
): string {
    let formattedMsg = '';

    if (configPath) {
        formattedMsg += `${colors.lightCyan(configPath)} - `;
    }

    if (configLocation) {
        formattedMsg += colors.lightRed('Configuration error:') + ` ${message}`;

        formattedMsg += `\n  config location: `;
        formattedMsg += colors.lightRed(configLocation);
    } else {
        formattedMsg += colors.lightRed('Options error:') + ` ${message}`;
    }

    return formattedMsg;
}

export class InvalidConfigError extends Error {
    constructor(message: string, configPath: string | null | undefined, configLocation: string | null | undefined) {
        super(formatMessage(message, configPath, configLocation));
    }
}
