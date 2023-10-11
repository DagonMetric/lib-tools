export class ExitCodeError extends Error {
    constructor(
        public exitCode: number,
        public reason?: unknown
    ) {
        super(`Process was existed with code ${exitCode}.`);
    }
}
