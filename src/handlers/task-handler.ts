import assert from 'node:assert';
import { pathToFileURL } from 'node:url';

import { colors } from '../utils/colors.js';
import { dashCaseToCamelCase } from '../utils/dash-case-to-camel-case.js';
import { Logger, LoggerBase } from '../utils/logger.js';
import { findUp, normalizePathToPOSIXStyle } from '../utils/path-helpers.js';

import { BuildTask } from './build-task.js';
import { CustomTask } from './custom-task.js';
import { InvalidConfigError } from './exceptions/index.js';
import { HandlerOptions } from './handler-options.js';

import { build } from './internals/build/index.js';
import { exec } from './internals/exec.js';

type CustomTaskHandlerFn = (task: Readonly<CustomTask>, options: Readonly<HandlerOptions>) => Promise<void> | void;

function checkDefined<T extends {}>(value: T | undefined): T {
    assert(value !== undefined);
    return value;
}

export class TaskHandler {
    private readonly options: HandlerOptions;
    private readonly logger: LoggerBase;
    private readonly addedTasks = new WeakMap<BuildTask | CustomTask, Promise<void>>();
    private readonly startTimes = new WeakMap<BuildTask | CustomTask, number>();

    private errored = false;

    constructor(options?: Partial<HandlerOptions>) {
        const logLevel = options?.logLevel ?? 'info';
        this.logger =
            options?.logger ??
            new Logger({
                logLevel,
                warnPrefix: colors.lightYellow('Warning:'),
                groupIndentation: 4
            });
        this.options = {
            logLevel,
            logger: this.logger,
            dryRun: options?.dryRun ?? false,
            env: options?.env ?? undefined
        };
    }

    async handleTasks(...tasks: readonly (BuildTask | CustomTask)[]): Promise<void> {
        const sortedTasks = [...tasks].sort((t1, t2) => (t1.priority ?? 0) - (t2.priority ?? 0));

        const results = await Promise.allSettled(
            sortedTasks.map((task) => {
                const cached = this.addedTasks.get(task);
                if (cached) {
                    return cached;
                }

                const promise = this.handleTaskCore(task);

                this.addedTasks.set(task, promise);

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
        this.startTimes.set(task, Date.now());

        if (this.errored) {
            return;
        }

        const taskPath = task.projectName ? `${task.projectName}/${task.taskName}` : task.taskName;
        this.logger.group(`\u25B7 ${colors.lightBlue(taskPath)}`);
    }

    protected onTaskFinish(task: BuildTask | CustomTask): void {
        if (this.errored) {
            return;
        }

        const taskPath = task.projectName ? `${task.projectName}/${task.taskName}` : task.taskName;
        const duration = Date.now() - checkDefined(this.startTimes.get(task));

        this.logger.groupEnd();
        this.logger.info(
            `${colors.lightGreen('\u25B6')} ${colors.lightBlue(taskPath)} ${colors.lightGreen(
                ` completed in ${duration} ms.`
            )}`
        );
    }

    protected onTaskError(task: BuildTask | CustomTask, err: unknown): void {
        if (this.errored) {
            return;
        }

        this.errored = true;
        const taskPath = task.projectName ? `${task.projectName}/${task.taskName}` : task.taskName;
        const duration = Date.now() - checkDefined(this.startTimes.get(task));

        this.logger.groupEnd();
        this.logger.error(
            `${colors.lightRed('\u2716')} ${colors.lightBlue(taskPath)} ${colors.lightRed(
                ` completed with error in ${duration} ms.`
            )}`
        );

        throw err;
    }

    private async handleTaskCore(task: Readonly<BuildTask> | Readonly<CustomTask>): Promise<void> {
        try {
            this.onTaskStart(task);

            if (task.taskCategory === 'build') {
                await build(task, this.options);
            } else {
                const taskLocation = `tasks/${task.taskName}/handler`;
                const configLocation = task.projectName ? `projects/${task.projectName}/${taskLocation}` : taskLocation;
                const handlerStr = task.handler.trim();

                if (handlerStr.toLocaleLowerCase().startsWith('exec:')) {
                    const index = handlerStr.indexOf(':') + 1;
                    if (handlerStr.length > index) {
                        const execCmd = handlerStr.substring(index).trim();
                        const envObj: Record<string, string | undefined> = { ...process.env };
                        envObj.logLevel = this.options.logLevel;

                        if (this.options.env) {
                            envObj[this.options.env] = 'true';
                        }

                        if (this.options.dryRun) {
                            envObj.dryRun = 'true';
                        }

                        await exec(execCmd, this.logger, envObj);
                    } else {
                        throw new InvalidConfigError('No valid exec command.', task.configPath, configLocation);
                    }
                } else {
                    const { workspaceRoot, projectRoot } = task;

                    const handlerPath = await findUp(normalizePathToPOSIXStyle(handlerStr), projectRoot, workspaceRoot);
                    if (!handlerPath) {
                        throw new InvalidConfigError(
                            `Handler module '${handlerStr}' doesn't exist.`,
                            task.configPath,
                            configLocation
                        );
                    }

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
                            'No valid default or name export function found.',
                            task.configPath,
                            configLocation
                        );
                    }

                    const result = taskHandlerFn(task, this.options);

                    if (result && result instanceof Promise) {
                        await result;
                    }
                }
            }

            this.onTaskFinish(task);
        } catch (err) {
            this.onTaskError(task, err);
        }
    }
}
