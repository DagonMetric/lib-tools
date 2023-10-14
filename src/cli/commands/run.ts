import { ArgumentsCamelCase, Argv } from 'yargs';

import { BuildCommandOptions, CommandOptions } from '../../config-models/index.js';
import {
    ExitCodeError,
    InvalidCommandOptionError,
    TaskHandler,
    getTasksFromCommandOptions
} from '../../handlers/index.js';
import { Logger, colors } from '../../utils/index.js';

function validateNonBuildCommandOptions(argv: CommandOptions): void {
    const buildOnlyArgNames: (keyof BuildCommandOptions)[] = ['outDir', 'copy', 'style', 'script', 'packageVersion'];

    for (const argvName of Object.keys(argv)) {
        if (buildOnlyArgNames.includes(argvName as keyof BuildCommandOptions)) {
            throw new InvalidCommandOptionError(argvName as keyof BuildCommandOptions, null, null);
        }
    }
}

export const command = 'run <task> [options..]';

export const describe = 'Run by task name';

export function builder(argv: Argv): Argv<CommandOptions> {
    return (
        argv
            .positional('task', {
                describe: 'Task to run',
                type: 'string'
            })

            // Shared task options
            .group(['logLevel', 'workspace', 'project', 'env', 'dryRun'], colors.lightCyan('Common task options:'))
            .option('logLevel', {
                describe: 'Set logging level for console output information',
                choices: ['debug', 'info', 'warn', 'error'] as const
            })
            .option('workspace', {
                describe: 'Set workspace root directory or libconfig.json file location',
                type: 'string'
            })
            .option('project', {
                describe: 'Set project name to Filter project(s), use comma `,` separator for multiple names',
                type: 'string'
            })
            .option('env', {
                describe: 'Set env name to override the task configuration with `envOverrides[name]` options',
                type: 'string'
            })
            .option('dryRun', {
                describe: 'Set true to run without cleaning or emitting files on physical file system',
                type: 'boolean'
            })

            // Buuild task options
            .group(
                ['outDir', 'clean', 'copy', 'style', 'script', 'packageVersion'],
                colors.lightCyan('Build task options:')
            )
            .option('outDir', {
                describe: 'Set output directory for build results',
                type: 'string'
            })
            .option('clean', {
                describe: 'Set true to clean build output directory before emitting built assets',
                type: 'boolean'
            })
            .option('copy', {
                describe: 'Set path(s) to copy assets to output directory, use comma `,` separator for multiple paths',
                type: 'string'
            })
            .option('style', {
                describe: 'Set style file(s) to bundle, use comma `,` separator for multiple files',
                type: 'string'
            })
            .option('script', {
                describe: 'Set files(s) to bundle, use comma `,` separator for multiple files',
                type: 'string'
            })
            .option('packageVersion', {
                describe: 'Set version to override the version field of the generated package.json file',
                type: 'string'
            })

            // help
            .option('help', {
                describe: 'Show help for this command',
                type: 'boolean'
            })
    );
}

export async function handler(argv: ArgumentsCamelCase<CommandOptions & { task: string }>): Promise<void> {
    const logLevel = argv.logLevel ?? 'info';
    const logger = new Logger({
        logLevel,
        warnPrefix: colors.lightYellow('Warning:'),
        groupIndentation: 4
    });

    try {
        if (argv.task !== 'build') {
            validateNonBuildCommandOptions(argv);
        }

        const tasks = await getTasksFromCommandOptions(argv);
        if (!tasks.length) {
            throw new Error(`${colors.lightRed('Error:')} No active task found for '${argv.task}'.`);
        }

        const taskHandler = new TaskHandler({
            logger,
            logLevel,
            env: argv.env,
            dryRun: argv.dryRun
        });

        await taskHandler.handleTasks(...tasks);
    } catch (err) {
        if (!err) {
            logger.error('Unhandled error occours.');
            process.exit(1);
        }

        if (err instanceof ExitCodeError) {
            process.exitCode = err.exitCode;

            if (err.message) {
                logger.error(err.message);
            }

            // TODO: To review
            throw err;
        } else {
            if ((err as Error).message) {
                logger.error((err as Error).message);
            }

            // TODO: To review
            throw new ExitCodeError(1, err);
        }
    }
}
