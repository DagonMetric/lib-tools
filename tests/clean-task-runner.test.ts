import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { getCleanTaskRunner } from '../src/handlers/build/clean/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../src/helpers/index.js';
import { AfterBuildCleanOptions, BeforeBuildCleanOptions } from '../src/models/index.js';
import { Logger } from '../src/utils/index.js';

void describe('CleanTaskRunner', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
    const workspaceInfo: WorkspaceInfo = {
        workspaceRoot,
        projectRoot: workspaceRoot,
        projectName: 'clean-project',
        configPath: null
    };

    void describe('getCleanTaskRunner', () => {
        void it('should not get runner when clean=false', () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: false
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }));

            assert.equal(runner, null);
        });

        void it('should get runner with before build clean options when clean=true', () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);

            const expectedBeforeBuildCleanOptions: BeforeBuildCleanOptions = {
                cleanOutDir: true
            };

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, true);
            assert.equal(runner.options.runFor, 'before');
            assert.equal(runner.options.allowOutsideOutDir, false);
            assert.equal(runner.options.allowOutsideWorkspaceRoot, false);
            assert.deepStrictEqual(runner.options.beforeOrAfterCleanOptions, expectedBeforeBuildCleanOptions);
        });

        void it('should get runner with before build clean options', () => {
            const beforeBuildCleanOptions: BeforeBuildCleanOptions = {
                cleanOutDir: true,
                paths: ['a.txt', '**/*.md'],
                exclude: ['c.md']
            };

            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: {
                    beforeBuild: beforeBuildCleanOptions,
                    allowOutsideOutDir: false,
                    allowOutsideWorkspaceRoot: true
                }
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }));

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, false);
            assert.equal(runner.options.runFor, 'before');
            assert.equal(runner.options.allowOutsideOutDir, false);
            assert.equal(runner.options.allowOutsideWorkspaceRoot, true);
            assert.deepStrictEqual(runner.options.beforeOrAfterCleanOptions, beforeBuildCleanOptions);
        });

        void it('should get runner with after build clean options', () => {
            const afterBuildCleanOptions: AfterBuildCleanOptions = {
                paths: ['a.txt', '**/*.md'],
                exclude: ['c.md']
            };

            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: {
                    afterBuild: afterBuildCleanOptions,
                    allowOutsideOutDir: true,
                    allowOutsideWorkspaceRoot: false
                }
            };

            const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'info' }));

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, false);
            assert.equal(runner.options.runFor, 'after');
            assert.equal(runner.options.allowOutsideOutDir, true);
            assert.equal(runner.options.allowOutsideWorkspaceRoot, false);
            assert.deepStrictEqual(runner.options.beforeOrAfterCleanOptions, afterBuildCleanOptions);
        });
    });

    void describe('run', () => {
        void it('should delete output directory when clean=true', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);

            assert.ok(runner != null);

            const cleanedPaths = await runner.run();
            const expected = [buildTask._outDir];

            assert.deepStrictEqual(cleanedPaths.sort(), expected.sort());
        });

        void it('should respect exclude when cleaning', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: {
                    beforeBuild: {
                        cleanOutDir: true,
                        exclude: ['LICENSE', 'README.md']
                    }
                }
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);

            assert.ok(runner != null);

            const cleanedPaths = await runner.run();
            const expected = [
                path.resolve(buildTask._outDir, 'src'),
                path.resolve(buildTask._outDir, 'index.js'),
                path.resolve(buildTask._outDir, 'src/c.js'),
                path.resolve(buildTask._outDir, 'src/b.js'),
                path.resolve(buildTask._outDir, 'src/a.js')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expected.sort());
        });

        void it('should delete with after build clean options', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: {
                    afterBuild: {
                        paths: ['**/*.js'],
                        exclude: ['src/a.js']
                    }
                }
            };

            const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'error' }), true);

            assert.ok(runner != null);

            const cleanedPaths = await runner.run();
            const expected = [
                path.resolve(buildTask._outDir, 'index.js'),
                path.resolve(buildTask._outDir, 'src/c.js'),
                path.resolve(buildTask._outDir, 'src/b.js')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expected.sort());
        });

        void it('should throw an error if outDir is system root directory', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve('c:'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);

            assert.ok(runner != null);
            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is parent of workspace root or current working directory', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, '../'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);

            assert.ok(runner != null);
            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is parent of project root', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceInfo.projectRoot, '../'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);

            assert.ok(runner != null);
            await assert.rejects(async () => await runner.run());
        });

        // void it('should throw an error if cleaning system root directory', async () => {
        //     const buildTask: ParsedBuildTask = {
        //         _taskName: 'build',
        //         _workspaceInfo: workspaceInfo,
        //         _outDir: path.resolve(workspaceRoot, 'theout'),
        //         _packageJsonInfo: null,
        //         clean: {
        //             afterBuild: {
        //                 paths: ['c:']
        //             }
        //         }
        //     };

        //     const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'debug' }), true);

        //     assert.ok(runner != null);
        //     await assert.rejects(async () => await runner.run());
        // });

        // void it('should throw an error if cleaning workspace directory', async () => {
        //     const buildTask: ParsedBuildTask = {
        //         _taskName: 'build',
        //         _workspaceInfo: workspaceInfo,
        //         _outDir: path.resolve(workspaceRoot, 'theout'),
        //         _packageJsonInfo: null,
        //         clean: {
        //             afterBuild: {
        //                 paths: ['../']
        //             }
        //         }
        //     };

        //     const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'error' }), true);

        //     assert.ok(runner != null);
        //     await assert.rejects(async () => await runner.run());
        // });
    });
});
