export class InvalidCommandOptionError extends Error {
    constructor(message = '') {
        super(message);
    }
}
