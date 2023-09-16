import { ParsedBuildTaskConfig, ParsedCustomTaskConfig, ParsedTaskConfig } from '../../config-models/parsed/index.js';
import { LogLevelString, Logger } from '../../utils/index.js';

export interface TaskHandleContext {
    readonly taskOptions: ParsedTaskConfig;
    readonly logger: Logger;
    readonly logLevel: LogLevelString;
    readonly dryRun: boolean;
    readonly env: string | undefined;
}

export interface BuildTaskHandleContext extends TaskHandleContext {
    readonly taskOptions: ParsedBuildTaskConfig;
}

export interface CustomTaskHandleContext extends TaskHandleContext {
    readonly taskOptions: ParsedCustomTaskConfig;
}

export type CustomTaskHandlerFn = (context: CustomTaskHandleContext) => Promise<void> | void;
