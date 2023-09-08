import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { CleanTaskRunner, getCleanTaskRunner } from '../src/handlers/build/clean/index.js';
import { AfterBuildCleanOptions, BeforeBuildCleanOptions } from '../src/models/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../src/models/parsed/index.js';
import { Logger } from '../src/utils/index.js';

void describe('build/clean/getCleanTaskRunner', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
    const workspaceInfo: WorkspaceInfo = {
        workspaceRoot,
        projectRoot: workspaceRoot,
        projectName: 'clean-project',
        configPath: null
    };

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

    void it('should not get runner when no valid clean entry', () => {
        const buildTask: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _outDir: path.resolve(workspaceRoot, 'theout'),
            _packageJsonInfo: null,
            clean: {
                beforeBuild: {
                    paths: [' ']
                }
            }
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

void describe('build/clean/CleanTaskRunner', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean-project');
    const workspaceInfo: WorkspaceInfo = {
        workspaceRoot,
        projectRoot: workspaceRoot,
        projectName: 'clean-project',
        configPath: null
    };

    void describe('CleanTaskRunner:run [Error throws]', () => {
        void it(
            'should throw an error if cleaning system root directory - C:\\ on Windows',
            { skip: process.platform !== 'win32' },
            async () => {
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
            }
        );

        void it(
            'should throw an error if cleaning system root directory - C:/',
            { skip: process.platform !== 'win32' },
            async () => {
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
            }
        );

        void it(
            'should throw an error if cleaning unc root directory - \\\\server',
            { skip: process.platform !== 'win32' },
            async () => {
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
            }
        );

        void it(
            'should throw an error if cleaning unc root directory - \\\\server\\public',
            { skip: process.platform !== 'win32' },
            async () => {
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
            }
        );

        void it(
            'should throw an error if cleaning unc root directory - //erver//public',
            { skip: process.platform !== 'win32' },
            async () => {
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
            }
        );

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
    });

    void describe('CleanTaskRunner:run [Dry Run]', () => {
        const outDir = path.resolve(workspaceRoot, 'theout');
        const dryRun = true;

        void it('should delete output directory when cleanOutDir=true', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();

            assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
        });

        void it('should delete output directory when custom paths include /', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    paths: ['/']
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();

            assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
        });

        void it('should delete output directory when custom paths include \\', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    paths: ['\\']
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();

            assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
        });

        void it('should delete output directory when custom paths include .', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    paths: ['.']
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();

            assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
        });

        void it('should delete with before build clean options', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    paths: ['src', 'path-1/**/*.js', 'path-2/**', '**/index.js']
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();
            const expectedPaths = [
                path.resolve(runner.options.outDir, 'src'),
                path.resolve(runner.options.outDir, 'path-1/p1.js'),
                path.resolve(runner.options.outDir, 'path-2'),
                path.resolve(runner.options.outDir, 'path-2/p2.js'),
                path.resolve(runner.options.outDir, 'path-2/note.md'),
                path.resolve(runner.options.outDir, 'path-2/path-3'),
                path.resolve(runner.options.outDir, 'path-2/path-3/p3.js'),
                path.resolve(runner.options.outDir, 'index.js')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedPaths.sort());
        });

        void it('should delete with after build clean options', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['src', 'path-1', '**/*.md']
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();
            const expectedPaths = [
                path.resolve(runner.options.outDir, 'README.md'),
                path.resolve(runner.options.outDir, 'src'),
                path.resolve(runner.options.outDir, 'src/README.md'),
                path.resolve(runner.options.outDir, 'src/nested/README.md'),
                path.resolve(runner.options.outDir, 'path-1'),
                path.resolve(runner.options.outDir, 'path-2/note.md')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedPaths.sort());
        });

        void it('should respect exclude when cleaning paths - #1', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true,
                    exclude: ['/']
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();

            assert.deepStrictEqual(cleanedPaths, []);
        });

        void it('should respect exclude when cleaning paths - #2', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true,
                    exclude: ['path-*', 'src/**/*.md']
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();
            const expectedPaths: string[] = [
                path.resolve(runner.options.outDir, 'LICENSE'),
                path.resolve(runner.options.outDir, 'README.md'),
                path.resolve(runner.options.outDir, 'index.js'),
                path.resolve(runner.options.outDir, 'src/a.ts'),
                path.resolve(runner.options.outDir, 'src/b.ts'),
                path.resolve(runner.options.outDir, 'src/c.ts'),
                path.resolve(runner.options.outDir, 'src/nested/nested.ts')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedPaths.sort());
        });

        void it('should respect exclude when cleaning paths - #3', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['src'],
                    exclude: ['**/*.md', 'src/a.ts']
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();
            const expectedPaths = [
                path.resolve(runner.options.outDir, 'src/b.ts'),
                path.resolve(runner.options.outDir, 'src/c.ts'),
                path.resolve(runner.options.outDir, 'src/nested/nested.ts')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedPaths.sort());
        });

        void it('should respect exclude when cleaning paths - #4', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['path-2'],
                    exclude: ['src/nested/../../../theout/path-*/../path-2/path-3']
                },
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();
            const expectedPaths = [
                path.resolve(runner.options.outDir, 'path-2/note.md'),
                path.resolve(runner.options.outDir, 'path-2/p2.js')
            ];

            assert.deepStrictEqual(cleanedPaths.sort(), expectedPaths.sort());
        });
    });

    void describe('CleanTaskRunner:run [Actual Remove]', () => {
        const tempOutDir = path.resolve(workspaceRoot, 'temp-out');
        const dryRun = false;

        beforeEach(async () => {
            await fs.cp(path.resolve(workspaceRoot, 'theout'), tempOutDir, {
                recursive: true
            });
        });

        afterEach(async () => {
            const tempOutDirExisted = await fs
                .access(tempOutDir)
                .then(() => true)
                .catch(() => false);

            if (tempOutDirExisted) {
                await fs.rm(tempOutDir, {
                    recursive: true,
                    force: true
                });
            }
        });

        void it('should delete output directory when cleanOutDir=true [Actual Delete]', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },
                dryRun,
                workspaceInfo,
                outDir: tempOutDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();
            const expectedPaths = [runner.options.outDir];
            for (const cleanedPath of expectedPaths) {
                const fileDeleted = await fs
                    .access(cleanedPath)
                    .then(() => false)
                    .catch(() => true);
                assert.equal(fileDeleted, true, `'${cleanedPath}' should be deleted.`);
            }
            assert.deepStrictEqual(cleanedPaths, expectedPaths);
        });

        void it('should delete with after build clean options [Actual Delete]', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'after',
                beforeOrAfterCleanOptions: {
                    paths: ['**/README.md', '**/README.md']
                },
                dryRun,
                workspaceInfo,
                outDir: tempOutDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const cleanedPaths = await runner.run();
            const expectedPaths = [
                path.resolve(runner.options.outDir, 'README.md'),
                path.resolve(runner.options.outDir, 'src/README.md'),
                path.resolve(runner.options.outDir, 'src/nested/README.md')
            ];

            for (const cleanedPath of expectedPaths) {
                const fileDeleted = await fs
                    .access(cleanedPath)
                    .then(() => false)
                    .catch(() => true);
                assert.equal(fileDeleted, true, `'${cleanedPath}' should be deleted.`);
            }

            assert.deepStrictEqual(cleanedPaths.sort(), expectedPaths.sort());
        });
    });
});
