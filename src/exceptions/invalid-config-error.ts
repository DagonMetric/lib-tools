export class InvalidConfigError extends Error {
    constructor(message = '') {
        super('Invalid configuration. ' + message);
    }
}
