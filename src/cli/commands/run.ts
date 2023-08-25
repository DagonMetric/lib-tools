import { ArgumentsCamelCase, Argv } from 'yargs';

import { runBuildTask } from '../../handlers/build/index.js';
import { ParsedBuildTaskConfig, getTasks } from '../../helpers/index.js';
import { CommandOptions } from '../../models/index.js';
import { Logger, colors } from '../../utils/index.js';

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
            .group(['logLevel', 'workspace', 'project'], colors.cyan('Common task options:'))
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

            // Buuild task options
            .group(
                ['env', 'outputPath', 'clean', 'copy', 'style', 'script', 'version'],
                colors.cyan('Build task options:')
            )
            .option('env', {
                describe: 'Set env name to override the build task configuration with `envOverrides[name]` options.',
                type: 'string'
            })
            .option('outputPath', {
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
            .option('version', {
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

export async function handler(argv: ArgumentsCamelCase<CommandOptions>): Promise<void> {
    const taskName = argv.task;

    if (!taskName) {
        return;
    }

    const allTasks = await getTasks(argv);
    const tasks = allTasks.filter((t) => !t.skip && t.taskName === taskName);

    const logger = new Logger({
        logLevel: argv.logLevel ?? 'info',
        debugPrefix: 'Debug:',
        infoPrefix: 'Info:',
        warnPrefix: 'Warning:',
        errorPrefix: 'Error:'
    });

    if (!tasks.length) {
        logger.warn(`No active task found for '${taskName}'.`);
        process.exitCode = 1;

        return;
    }

    for (const task of tasks) {
        logger.info(`Running [${task.taskName}] task`);
        if (taskName === 'build') {
            await runBuildTask(task as ParsedBuildTaskConfig, logger);
        }
        // TODO:
        logger.info(`Running [${task.taskName}] task completed`);
    }
}
