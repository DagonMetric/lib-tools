import { ParsedBuildTaskConfig, ParsedCustomTaskConfig, ParsedTaskConfig } from '../../config-models/parsed/index.js';
import { LogLevelStrings, Logger } from '../../utils/index.js';

export interface TaskHandleContext {
    readonly taskOptions: Readonly<ParsedTaskConfig>;
    readonly logger: Logger;
    readonly logLevel: LogLevelStrings;
    readonly dryRun: boolean;
    readonly env: string | undefined;
}

export interface BuildTaskHandleContext extends TaskHandleContext {
    readonly taskOptions: Readonly<ParsedBuildTaskConfig>;
}

export interface CustomTaskHandleContext extends TaskHandleContext {
    readonly taskOptions: Readonly<ParsedCustomTaskConfig>;
}

export type CustomTaskHandlerFn = (context: CustomTaskHandleContext) => Promise<void> | void;
