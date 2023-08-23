import { Argv, ArgumentsCamelCase } from 'yargs';

import { BuildCommandOptions, ParsedBuildTaskConfig } from '../../models/index.js';
import { runBuildTask } from '../../handlers/build/index.js';
import {
    applyEnvOverrides,
    getParsedBuildTaskConfig,
    getBuildTaskConfigFromCommandOptions,
    getLibConfig,
    parseBuildCommandOptions
} from '../../helpers/index.js';
import { Logger } from '../../utils/index.js';

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
            .option('log-level', {
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
    const commandOptions = await parseBuildCommandOptions(argv);
    const libConfig = await getLibConfig(commandOptions._configPath);

    const buildTasks: ParsedBuildTaskConfig[] = [];

    if (libConfig) {
        const projects = Object.keys(libConfig.projects).map((projectName) => libConfig.projects[projectName]);
        for (const project of projects) {
            if (commandOptions._projects.length && !commandOptions._projects.includes(project._projectName)) {
                continue;
            }

            if (!project.tasks?.build || project.tasks?.build.skip) {
                continue;
            }

            applyEnvOverrides(project.tasks.build, commandOptions._env);

            const parsedBuildTask = await getParsedBuildTaskConfig(project.tasks.build, commandOptions, {
                workspaceRoot: project._workspaceRoot,
                projectRoot: project._projectRoot,
                projectName: project._projectName,
                configPath: project._configPath
            });
            buildTasks.push(parsedBuildTask);
        }
    }

    const buildTaskFromCommandOptions = getBuildTaskConfigFromCommandOptions(commandOptions, buildTasks);

    if (buildTaskFromCommandOptions && !buildTasks.length) {
        const workspaceRoot = process.cwd();
        const projectRoot = workspaceRoot;

        const parsedBuildTask = await getParsedBuildTaskConfig(buildTaskFromCommandOptions, commandOptions, {
            workspaceRoot,
            projectRoot,
            projectName: null,
            configPath: null
        });

        buildTasks.push(parsedBuildTask);
    }

    const logLevel = argv.logLevel ? argv.logLevel : 'info';
    const logger = new Logger({
        logLevel
    });

    if (!buildTasks.length) {
        logger.warn('No task to build.');

        return;
    }

    for (const buildTask of buildTasks) {
        await runBuildTask(buildTask);
    }
}
