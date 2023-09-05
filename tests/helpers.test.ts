import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { InvalidConfigError } from '../src/exceptions/index.js';
import { applyEnvOverrides } from '../src/helpers/apply-env-overrides.js';
import { applyProjectExtends } from '../src/helpers/apply-project-extends.js';
import { getParsedCommandOptions } from '../src/helpers/get-parsed-command-options.js';
import { getTasks } from '../src/helpers/get-tasks.js';
import { toParsedBuildTask } from '../src/helpers/to-parsed-build-task.js';
import { toParsedTask } from '../src/helpers/to-parsed-task.js';
import { BuildTask, CommandOptions, ExternalTask, Project, Task } from '../src/models/index.js';
import { ParsedBuildTask, ParsedCommandOptions, ParsedTask, WorkspaceInfo } from '../src/models/parsed/index.js';

void describe('applyEnvOverrides', () => {
    void it('should override with env value to build task', () => {
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

    void it('should override with env value to external task', () => {
        const config: ExternalTask = {
            handler: 'a.js',
            envOverrides: {
                prod: {
                    handler: 'b.js',
                    skip: true
                }
            }
        };

        applyEnvOverrides(config, { prod: true });

        const expectedConfig: BuildTask = {
            handler: 'b.js',
            skip: true,
            envOverrides: {
                prod: {
                    handler: 'b.js',
                    skip: true
                }
            }
        };

        assert.deepStrictEqual(config, expectedConfig);
    });
});

void describe('applyProjectExtends', () => {
    void it('should extend', () => {
        const projectATasks = {
            build: {
                banner: 'a',
                clean: true,
                copy: ['a.txt', 'b.txt']
            },
            lint: {
                handler: './handler.mjs'
            }
        };

        const projectBTasks = {
            build: {
                clean: false,
                style: ['a.css']
            },
            test: {
                handler: './handler.mjs'
            }
        };

        const projectCTasks = {
            build: {
                banner: 'c',
                script: ['a.js']
            }
        };

        const projects: Record<string, Project> = {
            a: {
                tasks: projectATasks as unknown as Record<string, ExternalTask>
            },
            b: {
                extends: 'a',
                tasks: projectBTasks as unknown as Record<string, ExternalTask>
            },
            c: {
                extends: 'b',
                tasks: projectCTasks as unknown as Record<string, ExternalTask>
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
                },
                test: {
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

void describe('getParsedCommandOptions', () => {
    void it('should parse command options', () => {
        const cmdOptions: CommandOptions = {
            workspace: '../notexist/libconfig.json',
            project: 'a,b,c',
            env: 'prod,ci',
            outDir: 'dist',
            clean: true,
            copy: 'a.txt,**/*.md',
            style: 'a.css,b.scss',
            script: 'a.js,b.ts',
            packageVersion: '1.0.0'
        };

        const result = getParsedCommandOptions(cmdOptions);

        const expected: ParsedCommandOptions = {
            ...cmdOptions,
            _configPath: path.resolve(process.cwd(), '../notexist/libconfig.json'),
            _workspaceRoot: path.resolve(process.cwd(), '../notexist'),
            _outDir: path.resolve(process.cwd(), '../notexist/dist'),
            _env: { prod: true, ci: true },
            _projects: ['a', 'b', 'c'],
            _copyEntries: ['a.txt', '**/*.md'],
            _styleEntries: ['a.css', 'b.scss'],
            _scriptEntries: ['a.js', 'b.ts']
        };

        assert.deepStrictEqual(result, expected);
    });
});

void describe('getParsedTask', () => {
    void it('should parse task config', () => {
        const task: Task = {
            handler: 'tasks.mjs',
            skip: true
        };

        const workspaceInfo: WorkspaceInfo = {
            workspaceRoot: process.cwd(),
            projectRoot: path.resolve(process.cwd(), 'tests/test-data'),
            projectName: 'test-project',
            configPath: null
        };

        const taskName = 'hello';

        const result = toParsedTask(taskName, task, workspaceInfo);

        const expected: ParsedTask = {
            ...task,
            _taskName: taskName,
            _workspaceInfo: workspaceInfo
        };

        assert.deepStrictEqual(result, expected);
    });
});

void describe('getParsedBuildTask', () => {
    void it('should parse build task config', () => {
        const buildTask: BuildTask = {
            outDir: 'out',
            clean: true,
            script: ['a.js', 'b.ts']
        };

        const workspaceInfo: WorkspaceInfo = {
            workspaceRoot: process.cwd(),
            projectRoot: process.cwd(),
            projectName: 'test-project',
            configPath: null
        };

        const result = toParsedBuildTask(buildTask, workspaceInfo, null, null);

        const expected: ParsedBuildTask = {
            ...buildTask,
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _packageJsonInfo: null,
            _outDir: path.resolve(process.cwd(), 'out')
        };

        assert.deepStrictEqual(result, expected);
    });

    void it('should parse build task config with cmd options outDir', () => {
        const buildTask: BuildTask = {
            clean: true,
            script: ['a.js', 'b.ts']
        };

        const workspaceInfo: WorkspaceInfo = {
            workspaceRoot: process.cwd(),
            projectRoot: process.cwd(),
            projectName: 'test-project',
            configPath: null
        };

        const cmdOptionsOutDir = path.resolve(process.cwd(), 'dist');

        const result = toParsedBuildTask(buildTask, workspaceInfo, null, cmdOptionsOutDir);

        const expected: ParsedBuildTask = {
            ...buildTask,
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _packageJsonInfo: null,
            _outDir: cmdOptionsOutDir
        };

        assert.deepStrictEqual(result, expected);
    });
});

void describe('getTasks', () => {
    void it('should return build task from cmd options', async () => {
        const cmdOptions: CommandOptions = {
            workspace: '../notexist',
            outDir: 'dist',
            clean: true,
            copy: 'a.txt,**/*.md',
            style: 'a.css,b.scss',
            script: 'a.js,b.ts',
            packageVersion: '1.0.0'
        };

        const result = await getTasks(cmdOptions);

        const expected: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: {
                workspaceRoot: path.resolve(process.cwd(), '../notexist'),
                projectRoot: path.resolve(process.cwd(), '../notexist'),
                projectName: null,
                configPath: null
            },
            _packageJsonInfo: null,
            _outDir: path.resolve(process.cwd(), '../notexist/dist'),
            clean: true,
            copy: ['a.txt', '**/*.md'],
            style: ['a.css', 'b.scss'],
            script: ['a.js', 'b.ts'],
            packageJson: {
                packageVersion: '1.0.0'
            }
        };

        assert.equal(result.length, 1);
        assert.deepStrictEqual(result[0], expected);
    });
});
