import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { InvalidConfigError } from '../src/exceptions/index.js';
import { applyEnvOverrides } from '../src/helpers/apply-env-overrides.js';
import { applyProjectExtends } from '../src/helpers/apply-project-extends.js';
import { ParsedBuildTask, getParsedBuildTask } from '../src/helpers/parsed-build-task.js';
import { ParsedCommandOptions, getParsedCommandOptions } from '../src/helpers/parsed-command-options.js';
import { WorkspaceInfo } from '../src/helpers/parsed-task.js';
import { BuildAndExternalTask, BuildTask, CommandOptions, ExternalTask, Project } from '../src/models/index.js';

void describe('Helpers', () => {
    void describe('applyEnvOverrides', () => {
        void it('should override with env value', () => {
            const config: BuildTask = {
                banner: 'b1',
                clean: false,
                copy: ['a.txt', 'b.md'],
                envOverrides: {
                    prod: {
                        banner: 'b2',
                        clean: true,
                        copy: ['c.md']
                    }
                }
            };

            applyEnvOverrides(config, { prod: true });

            const expectedConfig: BuildTask = {
                banner: 'b2',
                clean: true,
                copy: ['c.md'],
                envOverrides: {
                    prod: {
                        banner: 'b2',
                        clean: true,
                        copy: ['c.md']
                    }
                }
            };

            assert.deepStrictEqual(config, expectedConfig);
        });
    });

    void describe('applyProjectExtends', () => {
        void it('should extend', () => {
            const projectATasks: BuildAndExternalTask = {
                build: {
                    banner: 'a',
                    clean: true,
                    copy: ['a.txt', 'b.txt']
                },
                lint: {
                    handler: './handler.mjs'
                }
            };

            const projectBTasks: BuildAndExternalTask = {
                build: {
                    clean: false,
                    style: ['a.css']
                }
            };

            const projectCTasks: BuildAndExternalTask = {
                build: {
                    banner: 'c',
                    script: ['a.js']
                }
            };

            const projects: Record<string, Project> = {
                a: {
                    tasks: projectATasks as Record<string, ExternalTask>
                },
                b: {
                    extends: 'a',
                    tasks: projectBTasks as Record<string, ExternalTask>
                },
                c: {
                    extends: 'b',
                    tasks: projectCTasks as Record<string, ExternalTask>
                }
            };

            const projectC = projects.c;

            applyProjectExtends('c', projectC, projects);

            const expectedConfig = {
                extends: 'b',
                tasks: {
                    build: {
                        banner: 'c',
                        clean: false,
                        copy: ['a.txt', 'b.txt'],
                        style: ['a.css'],
                        script: ['a.js']
                    },
                    lint: {
                        handler: './handler.mjs'
                    }
                }
            };

            assert.deepStrictEqual(projectC, expectedConfig);
        });

        void it('should throw if cross extends found', () => {
            const projects: Record<string, Project> = {
                a: {
                    extends: 'c',
                    tasks: {}
                },
                b: {
                    extends: 'a',
                    tasks: {}
                },
                c: {
                    extends: 'b',
                    tasks: {}
                }
            };

            const projectC = projects.c;

            const expectedError = new InvalidConfigError('Cross referencing extend founds.', 'projects[c].extends');

            assert.throws(() => applyProjectExtends('c', projectC, projects), expectedError);
        });

        void it('should throw if no base project to extend', () => {
            const projects: Record<string, Project> = {
                a: {
                    tasks: {}
                },
                b: {
                    extends: 'c',
                    tasks: {}
                }
            };

            const projectB = projects.b;

            assert.throws(
                () => applyProjectExtends('b', projectB, projects),
                'Invalid configuration. No base project to extends. Config location: projects[b].extends'
            );
        });
    });

    void describe('getParsedBuildCommandOptions', () => {
        void it('should parse command options', () => {
            const cmdOptions: CommandOptions = {
                packageVersion: '1.0.0',
                workspace: '../notfound',
                outDir: 'dist',
                env: 'prod,ci',
                project: 'a,b,c',
                copy: 'a.txt,**/*.md',
                style: 'a.css,b.scss',
                script: 'a.js,b.ts'
            };

            const result = getParsedCommandOptions(cmdOptions);
            const actual = JSON.parse(JSON.stringify(result)) as ParsedCommandOptions;

            const expected: ParsedCommandOptions = {
                ...cmdOptions,
                _configPath: null,
                _workspaceRoot: path.resolve(process.cwd(), '../notfound'),
                _outDir: path.resolve(process.cwd(), '../notfound/dist'),
                _env: { prod: true, ci: true },
                _projects: ['a', 'b', 'c'],
                _copyEntries: ['a.txt', '**/*.md'],
                _styleEntries: ['a.css', 'b.scss'],
                _scriptEntries: ['a.js', 'b.ts']
            };

            assert.deepStrictEqual(actual, expected);
        });
    });

    void describe('getParsedBuildTaskConfig', () => {
        void it('should parse build task config', async () => {
            const buildTask: BuildTask = {
                outDir: 'out',
                clean: true,
                script: ['a.js', 'b.ts']
            };

            const cmdOptions: ParsedCommandOptions = {
                _env: {},
                _configPath: null,
                _workspaceRoot: null,
                _outDir: null,
                _projects: [],
                _copyEntries: [],
                _scriptEntries: [],
                _styleEntries: []
            };

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: process.cwd(),
                projectRoot: process.cwd(),
                projectName: null,
                configPath: null
            };

            const result = await getParsedBuildTask(buildTask, workspaceInfo, cmdOptions, null);
            const actual = JSON.parse(JSON.stringify(result)) as ParsedBuildTask;

            const expected: ParsedBuildTask = {
                ...buildTask,
                _handleTask: null,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: null,
                _outDir: path.resolve(process.cwd(), 'out')
            };

            assert.deepStrictEqual(actual, expected);
        });
    });
});
