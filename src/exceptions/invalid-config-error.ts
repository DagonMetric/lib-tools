export class InvalidConfigError extends Error {
    constructor(message: string, configLocation: string | null) {
        super(`Invalid configuration. ${message} Config location: ${configLocation}`);
    }
}
