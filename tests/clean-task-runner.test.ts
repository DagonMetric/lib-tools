import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
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
        void it('should delete output directory when clean=true [Dry Run]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);
            assert.ok(runner);

            const cleanedPaths = await runner.run();
            const expectedCleanPaths = [buildTask._outDir];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedCleanPaths.sort());
        });

        void it('should respect exclude when cleaning [Dry Run]', async () => {
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
            assert.ok(runner);

            const cleanedPaths = await runner.run();
            const expectedCleanPaths = [
                path.resolve(buildTask._outDir, 'src'),
                path.resolve(buildTask._outDir, 'index.js'),
                path.resolve(buildTask._outDir, 'src/c.js'),
                path.resolve(buildTask._outDir, 'src/b.js'),
                path.resolve(buildTask._outDir, 'src/a.js')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedCleanPaths.sort());
        });

        void it('should delete with after build clean options [Dry Run]', async () => {
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
            assert.ok(runner);

            const cleanedPaths = await runner.run();
            const expectedCleanPaths = [
                path.resolve(buildTask._outDir, 'index.js'),
                path.resolve(buildTask._outDir, 'src/c.js'),
                path.resolve(buildTask._outDir, 'src/b.js')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedCleanPaths.sort());
        });

        void it('should throw an error if outDir is system root directory [Dry Run]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve('c:'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);
            assert.ok(runner);

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is parent of workspace root [Dry Run]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, '../'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);
            assert.ok(runner);

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is parent of project root [Dry Run]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceInfo.projectRoot, '../'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), true);
            assert.ok(runner);

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning system root directory [Dry Run]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: {
                    afterBuild: {
                        paths: ['C:\\']
                    }
                }
            };

            const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'error' }), true);
            assert.ok(runner);

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning workspace directory [Dry Run]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: {
                    afterBuild: {
                        paths: ['../']
                    }
                }
            };

            const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'error' }), true);
            assert.ok(runner);

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning outside of workspace directory [Dry Run]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: {
                    afterBuild: {
                        paths: ['../../dist']
                    }
                }
            };

            const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'error' }), true);
            assert.ok(runner);

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning outside of outDir [Dry Run]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'path1/path2/theout'),
                _packageJsonInfo: null,
                clean: {
                    afterBuild: {
                        paths: ['../']
                    }
                }
            };

            const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'error' }), true);
            assert.ok(runner);

            await assert.rejects(async () => await runner.run());
        });

        void it('should delete output directory when clean=true [Actual Delete]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'temp-out'),
                _packageJsonInfo: null,
                clean: true
            };

            await fs.mkdir(buildTask._outDir, {
                mode: 0o777,
                recursive: true
            });
            await fs.copyFile(
                path.resolve(workspaceRoot, 'theout/README.md'),
                path.resolve(buildTask._outDir, 'README.md')
            );

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }), false);
            assert.ok(runner != null);

            const cleanedPaths = await runner.run();

            const outDirDeleted = await fs
                .access(buildTask._outDir)
                .then(() => false)
                .catch(() => true);

            assert.equal(outDirDeleted, true, "'outDir' file should be deleted.");
            assert.deepStrictEqual(cleanedPaths.sort(), [buildTask._outDir].sort());
        });

        void it('should delete with after build clean options [Actual Delete]', async () => {
            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'temp-out'),
                _packageJsonInfo: null,
                clean: {
                    afterBuild: {
                        paths: ['LICENSE']
                    }
                }
            };

            const filePathToDelete = path.resolve(buildTask._outDir, 'LICENSE');

            await fs.mkdir(buildTask._outDir, {
                mode: 0o777,
                recursive: true
            });
            await fs.copyFile(path.resolve(workspaceRoot, 'theout/LICENSE'), filePathToDelete);

            const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'error' }), false);
            assert.ok(runner);

            const cleanedPaths = await runner.run();

            const outDirDeleted = await fs
                .access(buildTask._outDir)
                .then(() => false)
                .catch(() => true);
            const fileDeleted = await fs
                .access(filePathToDelete)
                .then(() => false)
                .catch(() => true);

            assert.equal(outDirDeleted, false, "'outDir' file should NOT be deleted.");
            assert.equal(fileDeleted, true, "'LICENSE' file should be deleted.");

            assert.deepStrictEqual(cleanedPaths.sort(), [filePathToDelete].sort());
        });
    });
});
