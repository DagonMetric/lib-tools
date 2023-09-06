export enum LogLevel {
    None = 0,
    Error = 2,
    Warn = 4,
    Info = 8,
    Debug = 16
}

export type LogLevelString = 'debug' | 'info' | 'warn' | 'error' | 'none';

export interface LoggerOptions {
    readonly logLevel?: LogLevel | LogLevelString;
    readonly name?: string;
    readonly debugPrefix?: string;
    readonly infoPrefix?: string;
    readonly warnPrefix?: string;
    readonly errorPrefix?: string;
}

export interface LoggerBase {
    log(level: LogLevel | LogLevelString, message: string, optionalParams?: unknown): void;
    debug(message: string, optionalParams?: unknown): void;
    info(message: string, optionalParams?: unknown): void;
    warn(message: string, optionalParams?: unknown): void;
    error(message: string, optionalParams?: unknown): void;
}

export class Logger implements LoggerBase {
    private _minLogLevel: LogLevel = LogLevel.Info;

    constructor(readonly loggerOptions: LoggerOptions) {
        if (this.loggerOptions.logLevel != null) {
            this._minLogLevel =
                typeof this.loggerOptions.logLevel === 'string'
                    ? this.toLogLevel(this.loggerOptions.logLevel)
                    : this.loggerOptions.logLevel;
        }
    }

    set minLogLevel(minLogLevel: LogLevel | LogLevelString) {
        this._minLogLevel = typeof minLogLevel === 'string' ? this.toLogLevel(minLogLevel) : minLogLevel;
    }

    log(level: LogLevel | LogLevelString, message: string, optionalParams?: unknown): void {
        const logLevel = typeof level === 'string' ? this.toLogLevel(level) : level;

        if (this._minLogLevel < logLevel || !message) {
            return;
        }

        const prefix = this.getPrefix(logLevel);

        const logMsg = `${prefix}${message.trimStart()}`;

        if (optionalParams) {
            if (logLevel === LogLevel.Warn) {
                console.warn(logMsg, optionalParams);
            } else {
                console.log(logMsg, optionalParams);
            }
        } else {
            if (logLevel === LogLevel.Warn) {
                console.warn(logMsg);
            } else {
                console.log(logMsg);
            }
        }
    }

    debug(message: string, optionalParams?: unknown): void {
        this.log(LogLevel.Debug, message, optionalParams);
    }

    info(message: string, optionalParams?: unknown): void {
        this.log(LogLevel.Info, message, optionalParams);
    }

    warn(message: string, optionalParams?: unknown): void {
        this.log(LogLevel.Warn, message, optionalParams);
    }

    error(message: string, optionalParams?: unknown): void {
        this.log(LogLevel.Error, message, optionalParams);
    }

    private toLogLevel(logLevelString: LogLevelString): LogLevel {
        switch (logLevelString) {
            case 'debug':
                return LogLevel.Debug;
            case 'info':
                return LogLevel.Info;
            case 'warn':
                return LogLevel.Warn;
            case 'error':
                return LogLevel.Error;
            case 'none':
                return LogLevel.None;
            default:
                return LogLevel.None;
        }
    }

    private getPrefix(logLevel: LogLevel): string {
        let prefix = '';
        if (this.loggerOptions.name) {
            prefix += `${this.loggerOptions.name} `;
        }

        if (logLevel === LogLevel.Debug && this.loggerOptions.debugPrefix) {
            prefix += `${this.loggerOptions.debugPrefix} `;
        } else if (logLevel === LogLevel.Info && this.loggerOptions.infoPrefix) {
            prefix += `${this.loggerOptions.infoPrefix} `;
        } else if (logLevel === LogLevel.Warn && this.loggerOptions.warnPrefix) {
            prefix += `${this.loggerOptions.warnPrefix} `;
        } else if (logLevel === LogLevel.Error && this.loggerOptions.errorPrefix) {
            prefix += `${this.loggerOptions.errorPrefix} `;
        }

        return prefix;
    }
}
