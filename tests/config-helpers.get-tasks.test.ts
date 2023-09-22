import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { getTasks } from '../src/config-helpers/get-tasks.js';
import { CommandOptions } from '../src/config-models/index.js';
import { ParsedBuildTaskConfig, WorkspaceInfo } from '../src/config-models/parsed/index.js';

void describe('config-helpers/get-tasks', () => {
    void describe('getTasks', () => {
        void it('should return tasks from libconfig.json file', async () => {
            const workspaceRel = './tests/test-data/parsing/withconfig';

            const tasks = await getTasks(
                {
                    workspace: workspaceRel
                },
                'build'
            );

            const workspace1: WorkspaceInfo = {
                workspaceRoot: path.resolve(process.cwd(), workspaceRel),
                configPath: path.resolve(process.cwd(), workspaceRel, './libconfig.json'),
                nodeModulePath: path.resolve(process.cwd(), 'node_modules'),
                projectRoot: path.resolve(process.cwd(), workspaceRel, './packages/package-1'),
                projectName: 'project-1'
            };

            const task1: ParsedBuildTaskConfig = {
                _taskName: 'build',
                _workspaceInfo: { ...workspace1 },
                _packageJsonInfo: {
                    packageJson: {
                        name: '@scope/package-1',
                        version: '0.0.0'
                    },
                    packageJsonPath: path.resolve(process.cwd(), workspaceRel, './packages/package-1/package.json'),
                    packageName: '@scope/package-1',
                    packageScope: '@scope',
                    rootPackageJsonPath: path.resolve(process.cwd(), workspaceRel, './package.json'),
                    rootPackageJson: {
                        name: 'my-packages',
                        version: '1.0.0',
                        description: 'This is a test project.',
                        author: 'DagonMetric',
                        license: 'MIT',
                        homepage: 'https://github.com/dagonmetric/lib-tools'
                    },
                    newPackageVersion: '1.0.0'
                },
                _outDir: path.resolve(process.cwd(), workspaceRel, './packages/package-1/dist'),
                _bannerText: `// DagonMetric, MIT, ${new Date()
                    .getFullYear()
                    .toString()}, https://github.com/dagonmetric/lib-tools, project-1, @scope/package-1, 1.0.0, This is a test project.`,
                clean: false,
                banner: true,
                packageJson: {
                    packageVersion: 'root'
                }
            };

            const task2 = {
                ...task1,
                _workspaceInfo: {
                    ...workspace1,
                    projectName: 'project-2'
                },
                _bannerText: `// DagonMetric, MIT, ${new Date()
                    .getFullYear()
                    .toString()}, https://github.com/dagonmetric/lib-tools, project-2, @scope/package-1, 1.0.0, This is a test project.`
            };

            const expectedTasks = [task1, task2];

            assert.deepStrictEqual(tasks, expectedTasks);
        });

        void it('should return tasks from command options with config file', async () => {
            const workspaceRel = './tests/test-data/parsing/withconfig';
            const cmdOptions: CommandOptions = {
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

            const tasks = await getTasks(cmdOptions, 'build');

            const workspace1: WorkspaceInfo = {
                workspaceRoot: path.resolve(process.cwd(), workspaceRel),
                configPath: path.resolve(process.cwd(), workspaceRel, './libconfig.json'),
                nodeModulePath: path.resolve(process.cwd(), 'node_modules'),
                projectRoot: path.resolve(process.cwd(), workspaceRel, './packages/package-1'),
                projectName: 'project-1'
            };

            const task1: ParsedBuildTaskConfig = {
                _taskName: 'build',
                _workspaceInfo: { ...workspace1 },
                _packageJsonInfo: {
                    packageJson: {
                        name: '@scope/package-1',
                        version: '0.0.0'
                    },
                    packageJsonPath: path.resolve(process.cwd(), workspaceRel, './packages/package-1/package.json'),
                    packageName: '@scope/package-1',
                    packageScope: '@scope',
                    rootPackageJsonPath: path.resolve(process.cwd(), workspaceRel, './package.json'),
                    rootPackageJson: {
                        name: 'my-packages',
                        version: '1.0.0',
                        description: 'This is a test project.',
                        author: 'DagonMetric',
                        license: 'MIT',
                        homepage: 'https://github.com/dagonmetric/lib-tools'
                    },
                    newPackageVersion: '2.0.0'
                },
                _outDir: path.resolve(process.cwd(), workspaceRel, './packages/package-1/dist'),
                _bannerText: `// DagonMetric, MIT, ${new Date()
                    .getFullYear()
                    .toString()}, https://github.com/dagonmetric/lib-tools, project-1, @scope/package-1, 2.0.0, This is a test project.`,
                outDir: 'dist',
                clean: true,
                banner: true,
                copy: ['**/*.js', 'README.md'],
                style: ['style.scss'],
                script: ['index.ts'],
                packageJson: {
                    packageVersion: '2.0.0'
                }
            };

            const task2 = {
                ...task1,
                _workspaceInfo: {
                    ...workspace1,
                    projectName: 'project-2'
                },
                _bannerText: `// DagonMetric, MIT, ${new Date()
                    .getFullYear()
                    .toString()}, https://github.com/dagonmetric/lib-tools, project-2, @scope/package-1, 2.0.0, This is a test project.`
            };

            const expectedTasks = [task1, task2];

            assert.deepStrictEqual(tasks, expectedTasks);
        });
    });
});
