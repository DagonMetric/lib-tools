import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { getCleanTaskRunner } from '../src/handlers/build/clean/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../src/helpers/index.js';
import { AfterBuildCleanOptions, BeforeBuildCleanOptions } from '../src/models/index.js';
import { Logger } from '../src/utils/index.js';

void describe('CleanTaskRunner', () => {
    void describe('getCleanTaskRunner', () => {
        void it('should not get runner when clean=false options is passed', () => {
            const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                configPath: null
            };

            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: false
            };

            const runner = getCleanTaskRunner(buildTask, new Logger({ logLevel: 'info' }), 'before', true);

            assert.equal(runner, null);
        });

        void it('should get before build clean options', () => {
            const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                configPath: null
            };

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
                    allowOutsideOutDir: true,
                    allowOutsideWorkspaceRoot: true
                }
            };

            const runner = getCleanTaskRunner(buildTask, new Logger({ logLevel: 'info' }), 'before', true);

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, true);
            assert.equal(runner.options.runFor, 'before');
            assert.equal(runner.options.allowOutsideOutDir, true);
            assert.equal(runner.options.allowOutsideWorkspaceRoot, true);
            assert.deepStrictEqual(runner.options.beforeOrAfterCleanOptions, beforeBuildCleanOptions);
        });

        void it('should get before build clean options with cleanOutDir=true when clean=true options is passed', () => {
            const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                configPath: null
            };

            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner(buildTask, new Logger({ logLevel: 'info' }), 'before', true);

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, true);
            assert.equal(runner.options.runFor, 'before');
            assert.equal(runner.options.allowOutsideOutDir, false);
            assert.equal(runner.options.allowOutsideWorkspaceRoot, false);
            assert.deepStrictEqual(runner.options.beforeOrAfterCleanOptions, {
                cleanOutDir: true
            } as BeforeBuildCleanOptions);
        });

        void it('should get after build clean options', () => {
            const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                configPath: null
            };

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
                    allowOutsideWorkspaceRoot: true
                }
            };

            const runner = getCleanTaskRunner(buildTask, new Logger({ logLevel: 'info' }), 'after', true);

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, true);
            assert.equal(runner.options.runFor, 'after');
            assert.equal(runner.options.allowOutsideOutDir, true);
            assert.equal(runner.options.allowOutsideWorkspaceRoot, true);
            assert.deepStrictEqual(runner.options.beforeOrAfterCleanOptions, afterBuildCleanOptions);
        });

        void it('should delete output directory when clean=true', async () => {
            const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                configPath: null
            };

            const buildTask: ParsedBuildTask = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner(buildTask, new Logger({ logLevel: 'error' }), 'before', true);

            assert.ok(runner != null);

            const cleanedPaths = await runner.run();
            const expected = [path.resolve(buildTask._outDir)];

            assert.deepStrictEqual(cleanedPaths.sort(), expected.sort());
        });

        void it('should respect exclude when cleaning', async () => {
            const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                configPath: null
            };

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

            const runner = getCleanTaskRunner(buildTask, new Logger({ logLevel: 'error' }), 'before', true);

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
            const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
            const workspaceInfo: WorkspaceInfo = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                configPath: null
            };

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

            const runner = getCleanTaskRunner(buildTask, new Logger({ logLevel: 'error' }), 'after', true);

            assert.ok(runner != null);

            const cleanedPaths = await runner.run();
            const expected = [
                path.resolve(buildTask._outDir, 'index.js'),
                path.resolve(buildTask._outDir, 'src/c.js'),
                path.resolve(buildTask._outDir, 'src/b.js')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expected.sort());
        });
    });
});
