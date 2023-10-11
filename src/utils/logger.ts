import { Console } from 'node:console';

import { colors } from './colors.js';

export enum LogLevel {
    None = 0,
    Error = 2,
    Warn = 4,
    Info = 8,
    Debug = 16
}

export type LogLevelStrings = Uncapitalize<keyof typeof LogLevel>;

export interface LoggerOptions {
    readonly logLevel?: LogLevel | LogLevelStrings;
    readonly name?: string;
    readonly debugPrefix?: string;
    readonly infoPrefix?: string;
    readonly warnPrefix?: string;
    readonly errorPrefix?: string;
    readonly groupIndentation?: number;
}

export interface LoggerBase {
    log(level: LogLevel | LogLevelStrings, message: string, optionalParams?: unknown): void;
    debug(message: string, optionalParams?: unknown): void;
    info(message: string, optionalParams?: unknown): void;
    warn(message: string, optionalParams?: unknown): void;
    error(message: string, optionalParams?: unknown): void;
    group(label?: string): void;
    groupEnd(): void;
}

function toLogLevel(logLevelString: LogLevelStrings): LogLevel {
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

export class Logger implements LoggerBase {
    private readonly _console: Console;
    private _minLogLevel: LogLevel = LogLevel.Info;

    constructor(private readonly options: LoggerOptions) {
        if (this.options.logLevel != null) {
            this._minLogLevel =
                typeof this.options.logLevel === 'string' ? toLogLevel(this.options.logLevel) : this.options.logLevel;
        }

        this._console = new Console({
            stdout: process.stdout,
            stderr: process.stderr,
            groupIndentation: this.options.groupIndentation
        });
    }

    set minLogLevel(minLogLevel: LogLevel | LogLevelStrings) {
        this._minLogLevel = typeof minLogLevel === 'string' ? toLogLevel(minLogLevel) : minLogLevel;
    }

    log(level: LogLevel | LogLevelStrings, message: string, optionalParams?: unknown): void {
        const logLevel = typeof level === 'string' ? toLogLevel(level) : level;

        if (this._minLogLevel < logLevel || !message) {
            return;
        }

        const logMsg = this.getMessageWithPrefix(logLevel, message);

        if (optionalParams) {
            if (logLevel === LogLevel.Warn) {
                this._console.warn(logMsg, optionalParams);
            } else {
                this._console.log(logMsg, optionalParams);
            }
        } else {
            if (logLevel === LogLevel.Warn) {
                this._console.warn(logMsg);
            } else {
                this._console.log(logMsg);
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

    group(label?: string): void {
        this._console.group(label);
    }

    groupEnd(): void {
        this._console.groupEnd();
    }

    private getMessageWithPrefix(logLevel: LogLevel, message: string): string {
        let prefix = '';

        if (logLevel === LogLevel.Debug && this.options.debugPrefix) {
            prefix = this.options.debugPrefix;
        } else if (logLevel === LogLevel.Info && this.options.infoPrefix) {
            prefix = this.options.infoPrefix;
        } else if (logLevel === LogLevel.Warn && this.options.warnPrefix) {
            prefix = this.options.warnPrefix;
        } else if (logLevel === LogLevel.Error && this.options.errorPrefix) {
            prefix = this.options.errorPrefix;
        }

        if (prefix) {
            if (message.startsWith(prefix)) {
                prefix = '';
            } else {
                let strippedPrefix = colors.stripColor(prefix, true);

                if (strippedPrefix.endsWith(':')) {
                    strippedPrefix = strippedPrefix.substring(0, strippedPrefix.length - 1);
                }

                if (strippedPrefix.toLowerCase().startsWith('warn')) {
                    // normalize warning and warn
                    strippedPrefix = 'warn';
                } else if (strippedPrefix.toLowerCase().startsWith('debug')) {
                    // normalize debugging and debug
                    strippedPrefix = 'debug';
                }

                if (strippedPrefix) {
                    const startsWithRegExp = new RegExp(`^${strippedPrefix}`, 'i');
                    const strippedMessage = colors.stripColor(message, true);

                    if (startsWithRegExp.test(strippedMessage)) {
                        prefix = '';
                    }
                }
            }
        }

        const messageWithPrefix = `${this.options.name ? `${this.options.name} ` : ''}${
            prefix ? `${prefix} ` : ''
        }${message.trimStart()}`;

        return messageWithPrefix;
    }
}
