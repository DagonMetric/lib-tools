import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { CleanTaskRunner, getCleanTaskRunner } from '../src/handlers/build/clean/index.js';
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
                    beforeBuild: beforeBuildCleanOptions
                }
            };

            const runner = getCleanTaskRunner('before', buildTask, new Logger({ logLevel: 'error' }));

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, false);
            assert.equal(runner.options.runFor, 'before');
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
                    afterBuild: afterBuildCleanOptions
                }
            };

            const runner = getCleanTaskRunner('after', buildTask, new Logger({ logLevel: 'info' }));

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, false);
            assert.equal(runner.options.runFor, 'after');
            assert.deepStrictEqual(runner.options.beforeOrAfterCleanOptions, afterBuildCleanOptions);
        });
    });

    void describe('CleanTaskRunner:run', () => {
        void it('should throw an error if outDir is empty', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun: true,
                workspaceInfo,
                outDir: ' ',
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is system root directory - C:\\', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve('C:\\'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is system root directory - /', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve('/'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is unc root directory - \\\\server\\public', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve('\\\\server\\public'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is unc root directory - //server/public', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve('//server/public'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is parent of workspace root', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, '../'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is parent of project root', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceInfo.projectRoot, '../'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning system root directory - C:\\', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['C:\\']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning system root directory - C:/', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['C:/']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning unc root directory - \\\\server', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['\\\\server']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning unc root directory - \\\\server\\public', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['\\\\server\\public']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning unc root directory - //erver//public', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['//erver//public']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning workspace directory', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['../']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning outside of workspace directory', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['../../dist']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if cleaning outside of output directory', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['../']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout/src'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should delete output directory when cleanOutDir=true [Dry Run]', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();

            assert.deepStrictEqual(cleanedPaths.sort(), [runner.options.outDir].sort());
        });

        void it('should respect exclude when cleaning output directory [Dry Run]', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true,
                    exclude: ['LICENSE', '**/*.md', 'src/a.js']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();

            const expectedCleanPaths = [
                path.resolve(runner.options.outDir, 'path-1/p1.ts'),
                path.resolve(runner.options.outDir, 'path-1'),
                path.resolve(runner.options.outDir, 'path-2/p2.ts'),
                path.resolve(runner.options.outDir, 'path-2'),
                path.resolve(runner.options.outDir, 'index.js'),
                path.resolve(runner.options.outDir, 'src/c.js'),
                path.resolve(runner.options.outDir, 'src/b.js')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedCleanPaths.sort());
        });

        void it('should delete with after build clean options [Dry Run]', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['**/*.js', '**/*.md', 'src', 'path-1'],
                    exclude: ['README.md', 'path-*/**']
                },
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'theout'),
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();
            const expectedCleanPaths = [
                path.resolve(runner.options.outDir, 'index.js'),
                path.resolve(runner.options.outDir, 'src/c.js'),
                path.resolve(runner.options.outDir, 'src/b.js'),
                path.resolve(runner.options.outDir, 'src/a.js'),
                path.resolve(runner.options.outDir, 'src/README.md'),
                path.resolve(runner.options.outDir, 'src')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedCleanPaths.sort());
        });

        void it('should delete output directory when cleanOutDir=true [Actual Delete]', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun: false,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'temp-out'),
                logger: new Logger({ logLevel: 'error' })
            });

            await fs.mkdir(runner.options.outDir, {
                mode: 0o777,
                recursive: true
            });
            await fs.copyFile(
                path.resolve(workspaceRoot, 'theout/README.md'),
                path.resolve(runner.options.outDir, 'README.md')
            );

            const cleanedPaths = await runner.run();

            const outDirDeleted = await fs
                .access(runner.options.outDir)
                .then(() => false)
                .catch(() => true);

            assert.equal(outDirDeleted, true, "'outDir' should be deleted.");
            assert.deepStrictEqual(cleanedPaths.sort(), [runner.options.outDir].sort());
        });

        void it('should delete with after build clean options [Actual Delete]', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['**/*.js', '**/*.md']
                },
                dryRun: false,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, 'temp-out'),
                logger: new Logger({ logLevel: 'error' })
            });

            await fs.mkdir(runner.options.outDir, {
                mode: 0o777,
                recursive: true
            });
            await fs.copyFile(
                path.resolve(workspaceRoot, 'theout/README.md'),
                path.resolve(runner.options.outDir, 'README.md')
            );
            await fs.copyFile(
                path.resolve(workspaceRoot, 'theout/index.js'),
                path.resolve(runner.options.outDir, 'index.js')
            );

            const cleanedPaths = await runner.run();
            const expectedCleanPaths = [
                path.resolve(runner.options.outDir, 'index.js'),
                path.resolve(runner.options.outDir, 'README.md')
            ];
            const file1Deleted = await fs
                .access(path.resolve(runner.options.outDir, 'index.js'))
                .then(() => false)
                .catch(() => true);
            const file2Deleted = await fs
                .access(path.resolve(runner.options.outDir, 'README.md'))
                .then(() => false)
                .catch(() => true);

            assert.equal(file1Deleted, true, `'index.js' should be deleted.`);
            assert.equal(file2Deleted, true, `'README.md' should be deleted.`);
            assert.deepStrictEqual(cleanedPaths.sort(), expectedCleanPaths.sort());
        });
    });
});
