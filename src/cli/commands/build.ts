import { Argv, ArgumentsCamelCase } from 'yargs';

import { InternalError } from '../../exceptions/index.js';
import { BuildCommandOptions, ParsedBuildTaskConfig, ParsedProjectConfig } from '../../models/index.js';
import { runBuildTask } from '../../handlers/build/index.js';
import { applyEnvOverrides, applyProjectExtends, parsedBuildTaskConfig, parseLibConfig } from '../../helpers/index.js';

export const command = 'build';

export const describe = 'Build the project(s)';

export function builder(argv: Argv): Argv<BuildCommandOptions> {
    return (
        argv
            .usage('$0 build [options...]')
            .example('$0 build', 'Build the project(s)')
            .option('version', {
                describe: 'Set version to override the version field of the package.json file',
                type: 'string'
            })
            .option('libconfig', {
                describe: 'Set libconfig.json file location or set `auto` to analyze project structure automatically',
                type: 'string'
            })
            .option('env', {
                describe: 'Set environment name to override the task configuration with envOverrides options',
                type: 'string'
            })
            .option('project', {
                describe: 'Set project name to Filter project(s)',
                type: 'string'
            })
            .option('logLevel', {
                describe: 'Set logging level for output information',
                // type: 'string'
                choices: ['debug', 'info', 'warn', 'error', 'none'] as const
            })
            // TODO: To support watch
            // .option('watch', {
            //     describe: 'Run in watch mode.',
            //     type: 'boolean'
            // })
            .option('help', {
                describe: 'Show help for build command',
                type: 'boolean'
            })
    );
}

export async function handler(argv: ArgumentsCamelCase<BuildCommandOptions>): Promise<void> {
    // const startTime = Date.now();

    const env =
        argv.env
            ?.split(',')
            .filter((envName) => envName && envName.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index)
            .reduce(
                (obj, key) => {
                    return {
                        ...obj,
                        [key]: true
                    };
                },
                {} as Record<string, boolean>
            ) ?? {};

    const parsedLibConfig = await parseLibConfig(argv);
    const filteredProjectNames =
        argv.project
            ?.split(',')
            .filter((projectName) => projectName && projectName.trim().length > 0)
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];
    const projects = Object.keys(parsedLibConfig.projects).map((projectName) => parsedLibConfig.projects[projectName]);

    const buildTasks: ParsedBuildTaskConfig[] = [];

    for (const project of projects) {
        if (filteredProjectNames.length && !filteredProjectNames.includes(project._projectName)) {
            continue;
        }

        const projectConfig = JSON.parse(JSON.stringify(project)) as ParsedProjectConfig;

        await applyProjectExtends(projectConfig, parsedLibConfig.projects, projectConfig._config);

        if (!projectConfig.tasks?.build) {
            continue;
        }

        applyEnvOverrides(projectConfig.tasks.build, env);

        if (projectConfig.tasks.build.skip) {
            continue;
        }

        const buildTask = await parsedBuildTaskConfig(projectConfig, argv);
        buildTasks.push(buildTask);
    }

    if (!buildTasks.length) {
        throw new InternalError('No project build task is found.');
    }

    // const logLevel = argv.logLevel ? argv.logLevel : 'info';
    // const logger = new Logger({
    //     logLevel
    // });

    for (const buildTask of buildTasks) {
        await runBuildTask(buildTask);
    }
}
