import { ArgumentsCamelCase, Argv } from 'yargs';

import { runBuildTask } from '../../handlers/build/index.js';
import { ParsedBuildTaskConfig, getTasks } from '../../helpers/index.js';
import { BuildCommandOptions } from '../../models/index.js';
import { Logger } from '../../utils/index.js';

export const command = 'build';

export const describe = 'Build the project(s)';

export function builder(argv: Argv): Argv<BuildCommandOptions> {
    return argv
        .usage('$0 build [options...]')
        .example('$0 build', 'Build the project(s)')
        .option('logLevel', {
            describe: 'Set logging level for output information',
            choices: ['debug', 'info', 'warn', 'error', 'none'] as const
        })
        .option('libconfig', {
            describe: 'Set libconfig.json file location',
            type: 'string'
        })
        .option('project', {
            describe: 'Set project name to Filter project(s)',
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
        .option('help', {
            describe: 'Show help for build command',
            type: 'boolean'
        });
}

export async function handler(argv: ArgumentsCamelCase<BuildCommandOptions>): Promise<void> {
    const tasks = await getTasks(argv);
    const buildTasks = tasks.filter((t) => !t.skip && t.taskName === 'build').map((t) => t as ParsedBuildTaskConfig);

    const logger = new Logger({
        logLevel: argv.logLevel ?? 'info',
        debugPrefix: 'Debug:',
        infoPrefix: 'Info:',
        warnPrefix: 'Warning:',
        errorPrefix: 'Error:'
    });

    if (!buildTasks.length) {
        logger.warn('No task to build.');
        process.exitCode = 1;

        return;
    }

    for (const buildTask of buildTasks) {
        logger.info(`Running [${buildTask.taskName}] task`);
        if (buildTask.handler) {
            //
        } else {
            await runBuildTask(buildTask, logger);
        }
        logger.info(`Running [${buildTask.taskName}] task completed`);
    }
}
