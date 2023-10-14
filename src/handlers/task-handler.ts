import assert from 'node:assert';
import { pathToFileURL } from 'node:url';

import { CommandOptions } from '../config-models/index.js';
import { Logger, colors } from '../utils/index.js';
import { dashCaseToCamelCase, resolvePath } from '../utils/internals/index.js';

import { BuildTask } from './build-task.js';
import { CustomTask } from './custom-task.js';
import { ExitCodeError, InvalidConfigError } from './exceptions/index.js';
import { HandlerOptions } from './handler-options.js';
import { build } from './internals/build/index.js';
import { exec } from './internals/exec.js';
import { getTasksFromCommandOptions, getTasksFromLibConfigFile } from './internals/get-tasks.js';
import { TaskFilter } from './task-filter.js';

type CustomTaskHandlerFn = (task: Readonly<CustomTask>, options: Readonly<HandlerOptions>) => Promise<void> | void;

function checkDefined<T extends {}>(value: T | undefined): T {
    assert(value !== undefined);
    return value;
}

export class TaskHandler {
    private _addedTasks = new WeakMap<BuildTask | CustomTask, Promise<void>>();
    private _startTimes = new WeakMap<BuildTask | CustomTask, number>();
    private readonly _context: HandlerOptions;
    private _errored = false;

    constructor(options?: Partial<HandlerOptions>) {
        const logLevel = options?.logLevel ?? 'info';
        const logger =
            options?.logger ??
            new Logger({
                logLevel,
                warnPrefix: colors.lightYellow('Warning:'),
                groupIndentation: 4
            });
        this._context = {
            logLevel,
            logger,
            dryRun: options?.dryRun ?? false,
            env: options?.env ?? undefined
        };
    }

    async getTasksFromCommandOptions(
        cmdOptions: Readonly<CommandOptions & { task: string }>
    ): Promise<(BuildTask | CustomTask)[]> {
        // TODO:
        return getTasksFromCommandOptions(cmdOptions);
    }

    async getTasksFromLibConfigFile(
        configPath: string,
        filter?: Readonly<TaskFilter> | null,
        env?: string
    ): Promise<(BuildTask | CustomTask)[]> {
        return getTasksFromLibConfigFile(configPath, filter, env);
    }

    async handleTasks(...tasks: readonly (BuildTask | CustomTask)[]): Promise<void> {
        const sortedTasks = [...tasks].sort((t1, t2) => (t1.priority ?? 0) - (t2.priority ?? 0));

        const results = await Promise.allSettled(
            sortedTasks.map((task) => {
                const cached = this._addedTasks.get(task);
                if (cached) {
                    return cached;
                }

                const promise = this._handleTaskCore(task);

                this._addedTasks.set(task, promise);

                return promise;
            })
        );

        for (const result of results) {
            if (result.status === 'rejected') {
                throw result.reason;
            }
        }
    }

    protected onTaskStart(task: BuildTask | CustomTask): void {
        this._startTimes.set(task, Date.now());

        if (this._errored) {
            return;
        }

        const taskPath = task.projectName ? `${task.projectName}/${task.taskName}` : task.taskName;
        this._context.logger.group(`\u25B7 ${colors.lightBlue(taskPath)}`);
    }

    protected onTaskFinish(task: BuildTask | CustomTask): void {
        if (this._errored) {
            return; // Skip logging.
        }

        const taskPath = task.projectName ? `${task.projectName}/${task.taskName}` : task.taskName;
        const duration = Date.now() - checkDefined(this._startTimes.get(task));

        this._context.logger.groupEnd();
        this._context.logger.info(
            `${colors.lightGreen('\u25B6')} ${colors.lightBlue(taskPath)} ${colors.lightGreen(
                ` completed in ${duration} ms.`
            )}`
        );
    }

    protected onTaskError(task: BuildTask | CustomTask, err: unknown): void {
        if (this._errored) {
            return;
        }

        this._errored = true;
        const taskPath = task.projectName ? `${task.projectName}/${task.taskName}` : task.taskName;
        const duration = Date.now() - checkDefined(this._startTimes.get(task));

        this._context.logger.groupEnd();
        this._context.logger.error(
            `${colors.lightRed('\u2716')} ${colors.lightBlue(taskPath)} ${colors.lightRed(
                ` completed with error in ${duration} ms.`
            )}`
        );

        if (!err) {
            if (process.exitCode === 0) {
                process.exitCode = 1;
            }

            return;
        }

        if (err instanceof ExitCodeError) {
            process.exitCode = err.exitCode;
            // TODO: message duplicated?
            if (err.message) {
                this._context.logger.error(err.message);
            }
        } else {
            if (process.exitCode === 0) {
                process.exitCode = 1;
            }

            this._context.logger.error((err as Error).message ?? err);
        }
    }

    private async _handleTaskCore(task: Readonly<BuildTask> | Readonly<CustomTask>): Promise<void> {
        try {
            this.onTaskStart(task);

            if (task.taskCategory === 'build') {
                await build(task, this._context);
            } else {
                const configLocation = task.projectName
                    ? `projects/${task.projectName}/tasks/${task.taskName}/handler`
                    : `tasks/${task.taskName}/handler`;
                const handlerStr = task.handler.trim();

                if (handlerStr.toLocaleLowerCase().startsWith('exec:')) {
                    const index = handlerStr.indexOf(':') + 1;
                    if (handlerStr.length > index) {
                        const execCmd = handlerStr.substring(index).trim();
                        const envObj: Record<string, string | undefined> = { ...process.env };
                        envObj.logLevel = this._context.logLevel;

                        if (this._context.env) {
                            envObj[this._context.env] = 'true';
                        }

                        if (this._context.dryRun) {
                            envObj.dryRun = 'true';
                        }

                        await exec(execCmd, this._context.logger, envObj);
                    } else {
                        throw new InvalidConfigError('No valid exec command.', task.configPath, configLocation);
                    }
                } else {
                    const projectRoot = task.projectRoot;
                    const handlerPath = resolvePath(projectRoot, handlerStr);
                    const handlerModule = (await import(pathToFileURL(handlerPath).toString())) as {};

                    const taskNameCamelCase = dashCaseToCamelCase(task.taskName);
                    let defaultTaskHander: CustomTaskHandlerFn | null = null;
                    let nameTaskHander: CustomTaskHandlerFn | null = null;

                    for (const [key, value] of Object.entries(handlerModule)) {
                        if (key === 'default' && typeof value === 'function') {
                            defaultTaskHander = value as CustomTaskHandlerFn;
                        } else if (key === taskNameCamelCase && typeof value === 'function') {
                            nameTaskHander = value as CustomTaskHandlerFn;
                            break;
                        }
                    }

                    const taskHandlerFn = nameTaskHander ?? defaultTaskHander;
                    if (!taskHandlerFn) {
                        throw new InvalidConfigError(
                            'No valid handler function found.',
                            task.configPath,
                            configLocation
                        );
                    }

                    const result = taskHandlerFn(task, this._context);

                    if (result && result instanceof Promise) {
                        await result;
                    }
                }
            }
        } catch (err) {
            this.onTaskError(task, err);

            throw err;
        }
    }
}
