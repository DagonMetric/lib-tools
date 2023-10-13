import { LogLevelStrings, LoggerBase } from '../../utils/index.js';

export interface HandlerContext {
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings;
    readonly dryRun: boolean;
    readonly env: string | undefined;
}
