export interface CommandOptions {
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';
    workspace?: string;
    project?: string;
}
