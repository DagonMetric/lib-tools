import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Argv } from 'yargs';

import { getTasks } from '../../config-helpers/index.js';
import { CommandOptions } from '../../config-models/index.js';
import { ParsedBuildTaskConfig } from '../../config-models/parsed/index.js';
import { TaskHandlerFn } from '../../handlers/interfaces/index.js';
import { Logger, colors, dashCaseToCamelCase, exec } from '../../utils/index.js';

export const command = 'run <task> [options..]';

export const describe = 'Run by task name';

export function builder(argv: Argv): Argv<CommandOptions> {
    return (
        argv
            .positional('task', {
                describe: 'Task name to run',
                type: 'string',
                default: 'build'
            })

            // Shared task options
            .group(['logLevel', 'workspace', 'project', 'env', 'dryRun'], colors.cyan('Common task options:'))
            .option('logLevel', {
                describe: 'Set logging level for output information',
                choices: ['debug', 'info', 'warn', 'error', 'none'] as const
            })
            .option('workspace', {
                describe: 'Set workspace root directory or libconfig.json file location',
                type: 'string'
            })
            .option('project', {
                describe: 'Set project name to Filter project(s)',
                type: 'string'
            })
            .option('env', {
                describe: 'Set env name to override the task configuration with `envOverrides[name]` options.',
                type: 'string'
            })
            .option('dryRun', {
                describe: 'Set true to run without cleaning or emitting files on physical file system.',
                type: 'boolean'
            })

            // Buuild task options
            .group(['outDir', 'clean', 'copy', 'style', 'script', 'packageVersion'], colors.cyan('Build task options:'))

            .option('outDir', {
                describe: 'Set output directory for build results',
                type: 'string'
            })
            .option('clean', {
                describe: 'Set true to clean build output directory before emitting build results',
                type: 'boolean'
            })
            .option('copy', {
                describe: 'Set path to copy assets to output directory',
                type: 'string'
            })
            .option('style', {
                describe: 'Set SCSS or CSS file entry to compile or bundle',
                type: 'string'
            })
            .option('script', {
                describe: 'Set TypeScript or JavaScript file entry to compile or bundle',
                type: 'string'
            })
            .option('packageVersion', {
                describe: 'Set version to override the version field of the package.json file',
                type: 'string'
            })

            // help
            .option('help', {
                describe: 'Show help for this command',
                type: 'boolean'
            })
    );
}

export async function run(argv: CommandOptions): Promise<void> {
    const taskName = argv.task;

    if (!taskName) {
        return;
    }

    const tasks = await getTasks(argv, taskName);

    const dryRun = argv.dryRun ? true : false;
    const logLevel = argv.logLevel ?? 'info';
    const logger = new Logger({
        logLevel,
        warnPrefix: colors.yellow('Warning:'),
        errorPrefix: colors.red('Error:'),
        groupIndentation: 4
    });

    if (!tasks.length) {
        logger.warn(`No active task found for '${taskName}'.`);
        process.exitCode = 1;

        return;
    }

    for (const task of tasks) {
        const taskPath = `${task._workspaceInfo.projectName ?? '0'}/${task._taskName}`;

        if (task.handler?.trim().length) {
            const handlerStr = task.handler?.trim();
            if (handlerStr.toLocaleLowerCase().startsWith('exec:')) {
                const index = handlerStr.indexOf(':') + 1;
                if (handlerStr.length > index) {
                    const execCmd = handlerStr.substring(index).trim();

                    logger.group(`\u25B7 ${colors.blue(taskPath)}`);
                    const start = Date.now();

                    await exec(execCmd);

                    logger.groupEnd();
                    logger.info(
                        `${colors.green('\u25B6')} ${colors.blue(taskPath)} ${colors.green(
                            ` completed in ${Date.now() - start}ms.`
                        )}`
                    );
                } else {
                    logger.warn(`No exec command found for ${colors.blue(taskPath)} task, skipping...`);
                    continue;
                }
            } else {
                const projectRoot = task._workspaceInfo.projectRoot;
                const handlerPath = path.isAbsolute(handlerStr)
                    ? path.resolve(handlerStr)
                    : path.resolve(projectRoot, handlerStr);

                const handlerModule = (await import(pathToFileURL(handlerPath).toString())) as {};

                const taskNameCamelCase = dashCaseToCamelCase(task._taskName);
                let defaultTaskHander: TaskHandlerFn | null = null;
                let nameTaskHander: TaskHandlerFn | null = null;

                for (const [key, value] of Object.entries(handlerModule)) {
                    if (key === 'default') {
                        defaultTaskHander = value as TaskHandlerFn;
                    } else if (key === taskNameCamelCase) {
                        nameTaskHander = value as TaskHandlerFn;
                        break;
                    }
                }

                const taskHandlerFn = nameTaskHander ?? defaultTaskHander;
                if (!taskHandlerFn) {
                    logger.warn(`No handler found for ${colors.blue(taskPath)} task, skipping...`);
                    continue;
                }

                logger.group(`\u25B7 ${colors.blue(taskPath)}`);
                const start = Date.now();

                const result = taskHandlerFn({
                    taskOptions: task,
                    logger,
                    logLevel,
                    dryRun
                });
                if (result && result instanceof Promise) {
                    await result;
                }

                logger.groupEnd();
                logger.info(
                    `${colors.green('\u25B6')} ${colors.blue(taskPath)} ${colors.green(
                        ` completed in ${Date.now() - start}ms.`
                    )}`
                );
            }
        } else if (task._taskName === 'build') {
            const buildHandlerModule = await import('../../handlers/build/index.js');

            logger.group(`\u25B7 ${colors.blue(taskPath)}`);
            const start = Date.now();

            await buildHandlerModule.default({
                taskOptions: task as ParsedBuildTaskConfig,
                logger,
                logLevel,
                dryRun
            });

            logger.groupEnd();
            logger.info(
                `${colors.green('\u25B6')} ${colors.blue(taskPath)} ${colors.green(
                    ` completed in ${Date.now() - start}ms.`
                )}`
            );
        } else {
            logger.warn(`No handler is defined for ${colors.blue(taskPath)} task, skipping...`);
            continue;
        }
    }
}
