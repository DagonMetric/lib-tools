import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { getParsedBuildTask } from '../src/config-helpers/get-parsed-build-task.js';
import { BuildTask } from '../src/config-models/index.js';
import { PackageJsonInfo, ParsedBuildTaskConfig, WorkspaceInfo } from '../src/config-models/parsed/index.js';
import { InvalidConfigError } from '../src/exceptions/index.js';

void describe('config-helpers/get-parsed-build-task', () => {
    void describe('getParsedBuildTask', () => {
        void it('should parse build task config with empty build task options', async () => {
            const buildTask: BuildTask = {};

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: process.cwd(),
                projectRoot: process.cwd(),
                projectName: 'test-project',
                configPath: null,
                nodeModulePath: null
            };

            const result = await getParsedBuildTask(buildTask, workspaceInfo, null);

            const expected: ParsedBuildTaskConfig = {
                ...buildTask,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: null,
                _outDir: path.resolve(process.cwd(), 'dist'),
                _bannerText: null
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should parse build task config with outDir options', async () => {
            const buildTask: BuildTask = {
                outDir: 'out'
            };

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: process.cwd(),
                projectRoot: process.cwd(),
                projectName: 'test-project',
                configPath: null,
                nodeModulePath: null
            };

            const result = await getParsedBuildTask(buildTask, workspaceInfo, null);

            const expected: ParsedBuildTaskConfig = {
                ...buildTask,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: null,
                _outDir: path.resolve(process.cwd(), 'out'),
                _bannerText: null
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should parse build task config with inline banner options start with //', async () => {
            const buildTask: BuildTask = {
                banner: '// This is an inline banner.\n[project_name], [current_year]'
            };

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: process.cwd(),
                projectRoot: process.cwd(),
                projectName: 'test-project',
                configPath: null,
                nodeModulePath: null
            };

            const result = await getParsedBuildTask(buildTask, workspaceInfo, null);

            const expected: ParsedBuildTaskConfig = {
                ...buildTask,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: null,
                _outDir: path.resolve(process.cwd(), 'dist'),
                _bannerText: `// This is an inline banner.\ntest-project, ${new Date().getFullYear().toString()}`
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should parse build task config with inline banner options start with /*', async () => {
            const buildTask: BuildTask = {
                banner: '/* This is an inline banner.\n[project_name], [current_year] */'
            };

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: process.cwd(),
                projectRoot: process.cwd(),
                projectName: 'test-project',
                configPath: null,
                nodeModulePath: null
            };

            const result = await getParsedBuildTask(buildTask, workspaceInfo, null);

            const expected: ParsedBuildTaskConfig = {
                ...buildTask,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: null,
                _outDir: path.resolve(process.cwd(), 'dist'),
                _bannerText: `/* This is an inline banner.\ntest-project, ${new Date().getFullYear().toString()} */`
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should parse build task config with inline banner options without comment single-line', async () => {
            const buildTask: BuildTask = {
                banner: 'This is an inline banner.'
            };

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: process.cwd(),
                projectRoot: process.cwd(),
                projectName: 'test-project',
                configPath: null,
                nodeModulePath: null
            };

            const result = await getParsedBuildTask(buildTask, workspaceInfo, null);

            const expected: ParsedBuildTaskConfig = {
                ...buildTask,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: null,
                _outDir: path.resolve(process.cwd(), 'dist'),
                _bannerText: `/*! This is an inline banner. */`
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should parse build task config with inline banner options without comment multi-line', async () => {
            const buildTask: BuildTask = {
                banner: 'This is an inline banner.\n[project_name], [current_year]'
            };

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: process.cwd(),
                projectRoot: process.cwd(),
                projectName: 'test-project',
                configPath: null,
                nodeModulePath: null
            };

            const result = await getParsedBuildTask(buildTask, workspaceInfo, null);

            const expected: ParsedBuildTaskConfig = {
                ...buildTask,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: null,
                _outDir: path.resolve(process.cwd(), 'dist'),
                _bannerText: `/*!\n * This is an inline banner.\n * test-project, ${new Date()
                    .getFullYear()
                    .toString()}\n */`
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should parse build task config with banner file and packageJsonInfo', async () => {
            const buildTask: BuildTask = {
                banner: 'banner.txt'
            };

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: path.resolve(process.cwd(), './tests/test-data/parsing/withconfig'),
                projectRoot: path.resolve(process.cwd(), './tests/test-data/parsing/withconfig'),
                projectName: 'test-project',
                configPath: null,
                nodeModulePath: null
            };

            const packageJsonInfo: PackageJsonInfo = {
                packageJson: {
                    version: '1.0.0',
                    author: 'DagonMetric',
                    license: 'MIT',
                    homepage: 'https://github.com/dagonmetric/lib-tools',
                    description: 'This is a test project.'
                },
                packageJsonPath: '',
                packageName: 'package-1',
                packageNameWithoutScope: '',
                packageScope: null,
                newPackageVersion: null,
                rootPackageJson: null,
                rootPackageJsonPath: null
            };

            const result = await getParsedBuildTask(buildTask, workspaceInfo, packageJsonInfo);

            const expected: ParsedBuildTaskConfig = {
                ...buildTask,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: packageJsonInfo,
                _outDir: path.resolve(workspaceInfo.projectRoot, 'dist'),
                _bannerText: `// DagonMetric, MIT, ${new Date()
                    .getFullYear()
                    .toString()}, https://github.com/dagonmetric/lib-tools, test-project, package-1, 1.0.0, This is a test project.`
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should parse build task config with banner=true and packageJsonInfo', async () => {
            const buildTask: BuildTask = {
                banner: true
            };

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: path.resolve(process.cwd(), './tests/test-data/parsing/withconfig'),
                projectRoot: path.resolve(process.cwd(), './tests/test-data/parsing/withconfig'),
                projectName: 'test-project',
                configPath: null,
                nodeModulePath: null
            };

            const packageJsonInfo: PackageJsonInfo = {
                packageJson: {
                    version: '1.0.0',
                    author: 'DagonMetric',
                    license: 'MIT',
                    homepage: 'https://github.com/dagonmetric/lib-tools',
                    description: 'This is a test project.'
                },
                packageJsonPath: '',
                packageName: 'package-1',
                packageNameWithoutScope: '',
                packageScope: null,
                newPackageVersion: null,
                rootPackageJson: null,
                rootPackageJsonPath: null
            };

            const result = await getParsedBuildTask(buildTask, workspaceInfo, packageJsonInfo);

            const expected: ParsedBuildTaskConfig = {
                ...buildTask,
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _packageJsonInfo: packageJsonInfo,
                _outDir: path.resolve(workspaceInfo.projectRoot, 'dist'),
                _bannerText: `// DagonMetric, MIT, ${new Date()
                    .getFullYear()
                    .toString()}, https://github.com/dagonmetric/lib-tools, test-project, package-1, 1.0.0, This is a test project.`
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should throw an error if banner file not exist', async () => {
            const buildTask: BuildTask = {
                banner: 'notexist.txt'
            };

            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot: path.resolve(process.cwd(), './tests/test-data/parsing'),
                projectRoot: path.resolve(process.cwd(), './tests/test-data/parsing'),
                projectName: null,
                configPath: null,
                nodeModulePath: null
            };

            const expectedError = new InvalidConfigError(
                `Banner file could not be found.`,
                workspaceInfo.configPath,
                `projects/${workspaceInfo.projectName ?? '0'}/build/banner`
            );

            await assert.rejects(async () => await getParsedBuildTask(buildTask, workspaceInfo, null), expectedError);
        });

        void describe('validate outDir', () => {
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
                async () => {
                    const outDir = path.resolve('C:\\');
                    const expectedError = new InvalidConfigError(
                        `The 'outDir' must not be system root directory.`,
                        workspaceInfo.configPath,
                        `${configLocationPrefix}/outDir`
                    );

                    await assert.rejects(
                        async () => await getParsedBuildTask({ outDir }, workspaceInfo, null),
                        expectedError
                    );
                }
            );

            void it('should throw an error if outDir is system root directory - /', async () => {
                const outDir = path.resolve('/');
                const expectedError = new InvalidConfigError(
                    `The 'outDir' must not be system root directory.`,
                    workspaceInfo.configPath,
                    `${configLocationPrefix}/outDir`
                );

                await assert.rejects(
                    async () => await getParsedBuildTask({ outDir }, workspaceInfo, null),
                    expectedError
                );
            });

            void it(
                'should throw an error if outDir is system root directory - \\\\server\\public on Windows',
                { skip: process.platform !== 'win32' },
                async () => {
                    const outDir = path.resolve('\\\\server\\public');
                    const expectedError = new InvalidConfigError(
                        `The 'outDir' must not be system root directory.`,
                        workspaceInfo.configPath,
                        `${configLocationPrefix}/outDir`
                    );

                    await assert.rejects(
                        async () => await getParsedBuildTask({ outDir }, workspaceInfo, null),
                        expectedError
                    );
                }
            );

            void it(
                'should throw an error if outDir is system root directory - //server/public on Windows',
                { skip: process.platform !== 'win32' },
                async () => {
                    const outDir = path.resolve('//server/public');
                    const expectedError = new InvalidConfigError(
                        `The 'outDir' must not be system root directory.`,
                        workspaceInfo.configPath,
                        `${configLocationPrefix}/outDir`
                    );

                    await assert.rejects(
                        async () => await getParsedBuildTask({ outDir }, workspaceInfo, null),
                        expectedError
                    );
                }
            );

            void it('should throw an error if outDir is parent of workspace root', async () => {
                const outDir = path.resolve(workspaceRoot, '../');
                const expectedError = new InvalidConfigError(
                    `The 'outDir' must not be parent of worksapce root or current working directory.`,
                    workspaceInfo.configPath,
                    `${configLocationPrefix}/outDir`
                );

                await assert.rejects(
                    async () => await getParsedBuildTask({ outDir }, workspaceInfo, null),
                    expectedError
                );
            });

            void it('should throw an error if outDir is parent of project root', async () => {
                const outDir = path.resolve(workspaceInfo.projectRoot, '../');
                const expectedError = new InvalidConfigError(
                    `The 'outDir' must not be parent of project root directory.`,
                    workspaceInfo.configPath,
                    `${configLocationPrefix}/outDir`
                );

                await assert.rejects(
                    async () => await getParsedBuildTask({ outDir }, workspaceInfo, null),
                    expectedError
                );
            });
        });
    });
});