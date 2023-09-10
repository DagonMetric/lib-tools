import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { getTasks, toParsedBuildTask, validateOutDir } from '../src/config-helpers/get-tasks.js';
import { BuildTask, CommandOptions } from '../src/config-models/index.js';
import { ParsedBuildTaskConfig, WorkspaceInfo } from '../src/config-models/parsed/index.js';
import { InvalidConfigError } from '../src/exceptions/index.js';

void describe('config-helpers/get-tasks', () => {
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
                logLevel: 'info',
                dryRun: true
            };

            const result = await getTasks(cmdOptions);

            const expected: ParsedBuildTaskConfig = {
                _taskName: 'build',
                _workspaceInfo: {
                    workspaceRoot: path.resolve(process.cwd(), './tests/test-data'),
                    projectRoot: path.resolve(process.cwd(), './tests/test-data'),
                    projectName: null,
                    configPath: path.resolve(process.cwd(), './tests/test-data/libconfig.json'),
                    nodeModulePath: path.resolve(process.cwd(), 'node_modules')
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
                configPath: null,
                nodeModulePath: null
            };

            const result = toParsedBuildTask(buildTask, workspaceInfo, null, null);

            const expected: ParsedBuildTaskConfig = {
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
                configPath: null,
                nodeModulePath: null
            };

            const cmdOptionsOutDir = path.resolve(process.cwd(), 'dist');

            const result = toParsedBuildTask(buildTask, workspaceInfo, null, cmdOptionsOutDir);

            const expected: ParsedBuildTaskConfig = {
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
            configPath: path.resolve(workspaceRoot, 'libconfig.json'),
            nodeModulePath: null
        };

        const configLocationPrefix = `projects/${workspaceInfo.projectName}/tasks/build`;

        void it(
            'should throw an error if outDir is system root directory - C:\\ on Windows',
            { skip: process.platform !== 'win32' },
            () => {
                const outDir = path.resolve('C:\\');
                const expectedError = new InvalidConfigError(
                    `The 'outDir' must not be system root directory.`,
                    workspaceInfo.configPath,
                    `${configLocationPrefix}/outDir`
                );

                assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
            }
        );

        void it('should throw an error if outDir is system root directory - /', () => {
            const outDir = path.resolve('/');
            const expectedError = new InvalidConfigError(
                `The 'outDir' must not be system root directory.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}/outDir`
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
                    `${configLocationPrefix}/outDir`
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
                    `${configLocationPrefix}/outDir`
                );

                assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
            }
        );

        void it('should throw an error if outDir is parent of workspace root', () => {
            const outDir = path.resolve(workspaceRoot, '../');
            const expectedError = new InvalidConfigError(
                `The 'outDir' must not be parent of worksapce root or current working directory.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}/outDir`
            );

            assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
        });

        void it('should throw an error if outDir is parent of project root', () => {
            const outDir = path.resolve(workspaceInfo.projectRoot, '../');
            const expectedError = new InvalidConfigError(
                `The 'outDir' must not be parent of project root directory.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}/outDir`
            );

            assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
        });
    });
});
