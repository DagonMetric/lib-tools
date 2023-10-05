import { pathToFileURL } from 'node:url';

import { ParsedBuildTaskConfig, ParsedCustomTaskConfig } from '../config-models/parsed/index.js';
import { LogLevelStrings, Logger, colors, dashCaseToCamelCase, exec, resolvePath } from '../utils/index.js';

import { CustomTaskHandlerFn } from './interfaces/index.js';

export async function handleTask(
    task: ParsedBuildTaskConfig | ParsedCustomTaskConfig,
    options: {
        logger: Logger;
        logLevel: LogLevelStrings;
        dryRun: boolean;
        env: string | undefined;
    }
): Promise<void> {
    const logLevel = options.logLevel;
    const logger = options.logger;

    const taskPath = `${task._workspaceInfo.projectName ?? '0'}/${task._taskName}`;

    if (task._taskName === 'build') {
        const buildHandlerModule = await import('./build/index.js');

        logger.group(`\u25B7 ${colors.lightBlue(taskPath)}`);
        const start = Date.now();

        await buildHandlerModule.default({
            taskOptions: task as ParsedBuildTaskConfig,
            logger,
            logLevel,
            dryRun: options?.dryRun ? true : false,
            env: options?.env
        });

        logger.groupEnd();
        logger.info(
            `${colors.lightGreen('\u25B6')} ${colors.lightBlue(taskPath)} ${colors.lightGreen(
                ` completed in ${Date.now() - start} ms.`
            )}`
        );
    } else {
        const customTask = task as ParsedCustomTaskConfig;
        const handlerStr = customTask.handler?.trim();
        if (!handlerStr) {
            logger.warn(`No handler is defined for ${colors.lightBlue(taskPath)} task, skipping...`);

            return;
        }

        if (handlerStr.toLocaleLowerCase().startsWith('exec:')) {
            const index = handlerStr.indexOf(':') + 1;
            if (handlerStr.length > index) {
                const execCmd = handlerStr.substring(index).trim();

                logger.group(`\u25B7 ${colors.lightBlue(taskPath)}`);
                const start = Date.now();

                const envObj: Record<string, string | undefined> = { ...process.env };
                envObj.logLevel = logLevel;
                if (options?.env) {
                    envObj[options.env] = 'true';
                }
                if (options?.dryRun) {
                    envObj.dryRun = 'true';
                }

                await exec(execCmd, logger, envObj);

                logger.groupEnd();
                logger.info(
                    `${colors.lightGreen('\u25B6')} ${colors.lightBlue(taskPath)} ${colors.lightGreen(
                        ` completed in ${Date.now() - start}ms.`
                    )}`
                );
            } else {
                logger.warn(`No exec command found for ${colors.lightBlue(taskPath)} task, skipping...`);

                return;
            }
        } else {
            const projectRoot = task._workspaceInfo.projectRoot;
            const handlerPath = resolvePath(projectRoot, handlerStr);

            const handlerModule = (await import(pathToFileURL(handlerPath).toString())) as {};

            const taskNameCamelCase = dashCaseToCamelCase(task._taskName);
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
                logger.warn(`No handler found for ${colors.lightBlue(taskPath)} task, skipping...`);

                return;
            }

            logger.group(`\u25B7 ${colors.lightBlue(taskPath)}`);
            const start = Date.now();

            const result = taskHandlerFn({
                taskOptions: customTask,
                logger,
                logLevel,
                dryRun: options?.dryRun ? true : false,
                env: options?.env
            });

            if (result && result instanceof Promise) {
                await result;
            }

            logger.groupEnd();
            logger.info(
                `${colors.lightGreen('\u25B6')} ${colors.lightBlue(taskPath)} ${colors.lightGreen(
                    ` completed in ${Date.now() - start} ms.`
                )}`
            );
        }
    }
}
