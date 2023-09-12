import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { getTasks, toParsedBuildTask, validateOutDir } from '../src/config-helpers/get-tasks.js';
import { BuildTask, CommandOptions } from '../src/config-models/index.js';
import { ParsedBuildTaskConfig, WorkspaceInfo } from '../src/config-models/parsed/index.js';
import { InvalidConfigError } from '../src/exceptions/index.js';

void describe('config-helpers/get-tasks', () => {
    void describe('getTasks', () => {
        void it('should return tasks from libconfig.json file', async () => {
            const workspaceRel = './tests/test-data/parsing/withconfig';

            const result = await getTasks(
                {
                    workspace: workspaceRel
                },
                'build'
            );

            const expected: ParsedBuildTaskConfig = {
                _taskName: 'build',
                _workspaceInfo: {
                    workspaceRoot: path.resolve(process.cwd(), workspaceRel),
                    projectRoot: path.resolve(process.cwd(), workspaceRel, './packages/package-1'),
                    projectName: 'project-1',
                    configPath: path.resolve(process.cwd(), workspaceRel, './libconfig.json'),
                    nodeModulePath: path.resolve(process.cwd(), 'node_modules')
                },
                _packageJsonInfo: {
                    packageJson: {
                        name: '@scope/package-1',
                        version: '0.0.0'
                    },
                    packageJsonPath: path.resolve(process.cwd(), workspaceRel, './packages/package-1/package.json'),
                    packageName: '@scope/package-1',
                    packageNameWithoutScope: 'package-1',
                    packageScope: '@scope',
                    isNestedPackage: false,
                    rootPackageVersion: '1.0.0'
                },
                _outDir: path.resolve(process.cwd(), workspaceRel, './packages/package-1/dist'),
                clean: false
            };

            assert.equal(result.length, 1);
            assert.deepStrictEqual(result[0], expected);
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

            const result = await getTasks(cmdOptions, 'build');

            const expected: ParsedBuildTaskConfig = {
                _taskName: 'build',
                _workspaceInfo: {
                    workspaceRoot: path.resolve(process.cwd(), workspaceRel),
                    projectRoot: path.resolve(process.cwd(), workspaceRel, './packages/package-1'),
                    projectName: 'project-1',
                    configPath: path.resolve(process.cwd(), workspaceRel, './libconfig.json'),
                    nodeModulePath: path.resolve(process.cwd(), 'node_modules')
                },
                _packageJsonInfo: {
                    packageJson: {
                        name: '@scope/package-1',
                        version: '0.0.0'
                    },
                    packageJsonPath: path.resolve(process.cwd(), workspaceRel, './packages/package-1/package.json'),
                    packageName: '@scope/package-1',
                    packageNameWithoutScope: 'package-1',
                    packageScope: '@scope',
                    isNestedPackage: false,
                    rootPackageVersion: '1.0.0'
                },
                _outDir: path.resolve(process.cwd(), workspaceRel, './packages/package-1/dist'),
                outDir: 'dist',
                clean: true,
                copy: ['**/*.js', 'README.md'],
                style: ['style.scss'],
                script: ['index.ts'],
                packageJson: {
                    packageVersion: '2.0.0'
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

            const result = toParsedBuildTask(buildTask, workspaceInfo, null, {});

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

            const result = toParsedBuildTask(buildTask, workspaceInfo, null, { outDir: 'dist' });

            const expected: ParsedBuildTaskConfig = {
                ...buildTask,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: null,
                _outDir: path.resolve(process.cwd(), 'dist')
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
