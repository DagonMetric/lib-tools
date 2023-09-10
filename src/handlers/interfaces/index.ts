import { ParsedBuildTaskConfig, ParsedTaskConfig } from '../../config-models/parsed/index.js';
import { LogLevelString, Logger } from '../../utils/index.js';

export interface TaskHandleContext {
    readonly taskOptions: ParsedTaskConfig;
    readonly dryRun: boolean;
    readonly logger: Logger;
    readonly logLevel: LogLevelString;
}

export interface BuildTaskHandleContext extends TaskHandleContext {
    readonly taskOptions: ParsedBuildTaskConfig;
}

export type TaskHandlerFn = (context: TaskHandleContext) => Promise<void> | void;
