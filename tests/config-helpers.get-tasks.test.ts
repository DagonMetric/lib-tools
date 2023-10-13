import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { CommandOptions } from '../src/config-models/index.js';
import { getTasksFromCommandOptions } from '../src/handlers/config-helpers/get-tasks.js';
import { BuildTask } from '../src/handlers/interfaces/index.js';

void describe('config-helpers/get-tasks', () => {
    void describe('getTasksFromCommandOptions', () => {
        void it('should return tasks from libconfig.json file', async () => {
            const workspaceRel = './tests/test-data/parsing/withconfig';

            const tasks = await getTasksFromCommandOptions({
                workspace: workspaceRel,
                task: 'build'
            });

            const task1: BuildTask = {
                projectName: 'project-1',
                taskCategory: 'build',
                taskName: 'build',
                workspaceRoot: path.resolve(process.cwd(), workspaceRel),
                configPath: path.resolve(process.cwd(), workspaceRel, './libconfig.json'),
                projectRoot: path.resolve(process.cwd(), workspaceRel, './packages/package-1'),
                outDir: path.resolve(process.cwd(), workspaceRel, './packages/package-1/dist'),
                clean: false,
                packageJson: {
                    packageVersion: 'root'
                }
            };

            const task2: BuildTask = {
                ...task1,
                projectName: 'project-2'
            };

            const expectedTasks = [task1, task2];

            assert.deepStrictEqual(tasks, expectedTasks);
        });

        void it('should return tasks from command options with config file', async () => {
            const workspaceRel = './tests/test-data/parsing/withconfig';
            const cmdOptions: CommandOptions & { task: string } = {
                task: 'build',

                workspace: workspaceRel,

                env: 'prod, ci',
                // project: 'project-1',

                outDir: 'dist',
                copy: '**/*.js, README.md',
                clean: true,
                style: 'style.scss , style.scss',
                script: 'index.ts, index.ts',
                packageVersion: '2.0.0'
            };

            const tasks = await getTasksFromCommandOptions(cmdOptions);

            const task1: BuildTask = {
                projectName: 'project-1',
                taskCategory: 'build',
                taskName: 'build',
                workspaceRoot: path.resolve(process.cwd(), workspaceRel),
                configPath: path.resolve(process.cwd(), workspaceRel, './libconfig.json'),
                projectRoot: path.resolve(process.cwd(), workspaceRel, './packages/package-1'),
                outDir: path.resolve(process.cwd(), workspaceRel, './packages/package-1/dist'),
                clean: true,
                copy: ['**/*.js', 'README.md'],
                style: ['style.scss'],
                script: ['index.ts'],
                packageJson: {
                    packageVersion: '2.0.0'
                }
            };

            const task2: BuildTask = {
                ...task1,
                projectName: 'project-2'
            };

            const expectedTasks = [task1, task2];

            assert.deepStrictEqual(tasks, expectedTasks);
        });
    });
});
