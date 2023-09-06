import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { applyEnvOverrides } from '../src/config-helpers/apply-env-overrides.js';
import { applyProjectExtends } from '../src/config-helpers/apply-project-extends.js';
import { getParsedCommandOptions } from '../src/config-helpers/get-parsed-command-options.js';
import { getTasks } from '../src/config-helpers/get-tasks.js';
import { toParsedBuildTask, validateOutDir } from '../src/config-helpers/to-parsed-build-task.js';
import { InvalidConfigError } from '../src/exceptions/index.js';
import { BuildTask, CommandOptions, ExternalTask, Project } from '../src/models/index.js';
import { ParsedBuildTask, ParsedCommandOptions, WorkspaceInfo } from '../src/models/parsed/index.js';

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

        applyProjectExtends('c', projectC, projects, null);

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

        const expectedError = new InvalidConfigError('Cross referencing extend founds.', null, 'projects[c].extends');

        assert.throws(() => applyProjectExtends('c', projectC, projects, null), expectedError);
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
            () => applyProjectExtends('b', projectB, projects, null),
            'Configuration error: No base project to extends. Config location: projects[b].extends'
        );
    });
});

void describe('getParsedCommandOptions', () => {
    void it('should parse command options - env', async () => {
        const cmdOptions: CommandOptions = {
            env: 'prod,ci'
        };

        const result = await getParsedCommandOptions(cmdOptions);

        const expected: ParsedCommandOptions = {
            ...cmdOptions,
            _configPath: null,
            _workspaceRoot: null,
            _outDir: null,
            _env: { prod: true, ci: true },
            _projects: [],
            _copyEntries: [],
            _styleEntries: [],
            _scriptEntries: []
        };

        assert.deepStrictEqual(result, expected);
    });

    void it('should parse command options - all', async () => {
        const cmdOptions: CommandOptions = {
            workspace: './tests/test-data/libconfig.json',
            outDir: 'dist',
            env: 'prod ,ci',
            project: 'a,b , c',
            copy: 'README.md, **/*.js',
            clean: true,
            style: 'styles.scss , styles.scss',
            script: 'index.ts, index.ts',
            packageVersion: '1.0.0',
            logLevel: 'info'
        };

        const result = await getParsedCommandOptions(cmdOptions);

        const expected: ParsedCommandOptions = {
            ...cmdOptions,
            _configPath: path.resolve(process.cwd(), './tests/test-data/libconfig.json'),
            _workspaceRoot: path.resolve(process.cwd(), './tests/test-data'),
            _outDir: path.resolve(process.cwd(), './tests/test-data/dist'),
            _env: { prod: true, ci: true },
            _projects: ['a', 'b', 'c'],
            _copyEntries: ['README.md', '**/*.js'],
            _styleEntries: ['styles.scss'],
            _scriptEntries: ['index.ts']
        };

        assert.deepStrictEqual(result, expected);
    });
});

void describe('toParsedBuildTask', () => {
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

void describe('validateOutDir', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data');
    const workspaceInfo: WorkspaceInfo = {
        workspaceRoot,
        projectRoot: path.resolve(workspaceRoot, 'test-project'),
        projectName: 'test-project',
        configPath: path.resolve(workspaceRoot, 'libconfig.json')
    };

    const configLocationPrefix = `projects[${workspaceInfo.projectName}].tasks.build`;

    void it(
        'should throw an error if outDir is system root directory - C:\\ on Windows',
        { skip: process.platform !== 'win32' },
        () => {
            const outDir = path.resolve('C:\\');
            const expectedError = new InvalidConfigError(
                `The 'outDir' must not be system root directory.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}.outDir`
            );

            assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
        }
    );

    void it('should throw an error if outDir is system root directory - /', () => {
        const outDir = path.resolve('/');
        const expectedError = new InvalidConfigError(
            `The 'outDir' must not be system root directory.`,
            workspaceInfo.configPath,
            `${configLocationPrefix}.outDir`
        );

        assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
    });

    void it(
        'should throw an error if outDir is system root directory - \\\\server\\public on Windows',
        { skip: process.platform !== 'win32' },
        () => {
            const outDir = path.resolve('\\\\server\\public');
            const expectedError = new InvalidConfigError(
                `The 'outDir' must not be system root directory.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}.outDir`
            );

            assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
        }
    );

    void it(
        'should throw an error if outDir is system root directory - //server/public on Windows',
        { skip: process.platform !== 'win32' },
        () => {
            const outDir = path.resolve('//server/public');
            const expectedError = new InvalidConfigError(
                `The 'outDir' must not be system root directory.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}.outDir`
            );

            assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
        }
    );

    void it('should throw an error if outDir is parent of workspace root', () => {
        const outDir = path.resolve(workspaceRoot, '../');
        const expectedError = new InvalidConfigError(
            `The 'outDir' must not be parent of worksapce root or current working directory.`,
            workspaceInfo.configPath,
            `${configLocationPrefix}.outDir`
        );

        assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
    });

    void it('should throw an error if outDir is parent of project root', () => {
        const outDir = path.resolve(workspaceInfo.projectRoot, '../');
        const expectedError = new InvalidConfigError(
            `The 'outDir' must not be parent of project root directory.`,
            workspaceInfo.configPath,
            `${configLocationPrefix}.outDir`
        );

        assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
    });
});

void describe('getTasks', () => {
    void it('should return build task from cmd options', async () => {
        const cmdOptions: CommandOptions = {
            workspace: './tests/test-data/libconfig.json',
            outDir: 'dist',
            env: 'prod ,ci',
            project: 'a,b , c',
            copy: 'README.md, **/*.js',
            clean: true,
            style: 'styles.scss , styles.scss',
            script: 'index.ts, index.ts',
            packageVersion: '3.0.0',
            logLevel: 'info'
        };

        const result = await getTasks(cmdOptions);

        const expected: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: {
                workspaceRoot: path.resolve(process.cwd(), './tests/test-data'),
                projectRoot: path.resolve(process.cwd(), './tests/test-data'),
                projectName: null,
                configPath: path.resolve(process.cwd(), './tests/test-data/libconfig.json')
            },
            _packageJsonInfo: null,
            _outDir: path.resolve(process.cwd(), './tests/test-data/dist'),
            clean: true,
            copy: ['README.md', '**/*.js'],
            style: ['styles.scss'],
            script: ['index.ts'],
            packageJson: {
                packageVersion: '3.0.0'
            }
        };

        assert.equal(result.length, 1);
        assert.deepStrictEqual(result[0], expected);
    });
});
