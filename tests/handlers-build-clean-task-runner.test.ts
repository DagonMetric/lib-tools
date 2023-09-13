import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { AfterBuildCleanOptions, BeforeBuildCleanOptions } from '../src/config-models/index.js';
import { ParsedBuildTaskConfig, WorkspaceInfo } from '../src/config-models/parsed/index.js';
import { CleanTaskRunner, getCleanTaskRunner } from '../src/handlers/build/clean/index.js';
import { Logger } from '../src/utils/index.js';

await describe('handlers/build/clean', async () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean');
    const workspaceInfo: WorkspaceInfo = {
        workspaceRoot,
        projectRoot: workspaceRoot,
        projectName: 'clean-project',
        configPath: null,
        nodeModulePath: null
    };

    void describe('getCleanTaskRunner', () => {
        void it('should not get runner when clean=false', () => {
            const buildTask: ParsedBuildTaskConfig = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: false
            };

            const runner = getCleanTaskRunner('before', {
                taskOptions: buildTask,
                dryRun: true,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error'
            });

            assert.equal(runner, null);
        });

        void it('should not get runner when no valid clean entry', () => {
            const buildTask: ParsedBuildTaskConfig = {
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

            const runner = getCleanTaskRunner('before', {
                taskOptions: buildTask,
                dryRun: true,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error'
            });

            assert.equal(runner, null);
        });

        void it('should get runner with before build clean options when clean=true', () => {
            const buildTask: ParsedBuildTaskConfig = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: true
            };

            const runner = getCleanTaskRunner('before', {
                taskOptions: buildTask,
                dryRun: true,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error'
            });

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

            const buildTask: ParsedBuildTaskConfig = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: {
                    beforeBuild: beforeBuildCleanOptions
                }
            };

            const runner = getCleanTaskRunner('before', {
                taskOptions: buildTask,
                dryRun: false,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error'
            });

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

            const buildTask: ParsedBuildTaskConfig = {
                _taskName: 'build',
                _workspaceInfo: workspaceInfo,
                _outDir: path.resolve(workspaceRoot, 'theout'),
                _packageJsonInfo: null,
                clean: {
                    afterBuild: afterBuildCleanOptions
                }
            };

            const runner = getCleanTaskRunner('after', {
                taskOptions: buildTask,
                dryRun: false,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error'
            });

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, false);
            assert.equal(runner.options.runFor, 'after');
            assert.deepStrictEqual(runner.options.beforeOrAfterCleanOptions, afterBuildCleanOptions);
        });
    });

    await describe('CleanTaskRunner', async () => {
        await describe('CleanTaskRunner:run [Error throws]', async () => {
            await it(
                'should throw an error if cleaning system root directory - C:\\ on Windows',
                { skip: process.platform !== 'win32' },
                async () => {
                    const runner = new CleanTaskRunner({
                        runFor: 'after',
                        beforeOrAfterCleanOptions: {
                            paths: ['C:\\']
                        },
                        dryRun: true,
                        workspaceInfo: {
                            ...workspaceInfo
                        },
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' })
                    });

                    await assert.rejects(async () => await runner.run());
                }
            );

            await it(
                'should throw an error if cleaning system root directory - C:/',
                { skip: process.platform !== 'win32' },
                async () => {
                    const runner = new CleanTaskRunner({
                        runFor: 'after',
                        beforeOrAfterCleanOptions: {
                            paths: ['C:/']
                        },
                        dryRun: true,
                        workspaceInfo: {
                            ...workspaceInfo
                        },
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' })
                    });

                    await assert.rejects(async () => await runner.run());
                }
            );

            await it(
                'should throw an error if cleaning unc root directory - \\\\server',
                { skip: process.platform !== 'win32' },
                async () => {
                    const runner = new CleanTaskRunner({
                        runFor: 'after',
                        beforeOrAfterCleanOptions: {
                            paths: ['\\\\server']
                        },
                        dryRun: true,
                        workspaceInfo: {
                            ...workspaceInfo
                        },
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' })
                    });

                    await assert.rejects(async () => await runner.run());
                }
            );

            await it(
                'should throw an error if cleaning unc root directory - \\\\server\\public',
                { skip: process.platform !== 'win32' },
                async () => {
                    const runner = new CleanTaskRunner({
                        runFor: 'after',
                        beforeOrAfterCleanOptions: {
                            paths: ['\\\\server\\public']
                        },
                        dryRun: true,
                        workspaceInfo: {
                            ...workspaceInfo
                        },
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' })
                    });

                    await assert.rejects(async () => await runner.run());
                }
            );

            await it(
                'should throw an error if cleaning unc root directory - //erver//public',
                { skip: process.platform !== 'win32' },
                async () => {
                    const runner = new CleanTaskRunner({
                        runFor: 'after',
                        beforeOrAfterCleanOptions: {
                            paths: ['//erver//public']
                        },
                        dryRun: true,
                        workspaceInfo: {
                            ...workspaceInfo
                        },
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' })
                    });

                    await assert.rejects(async () => await runner.run());
                }
            );

            await it('should throw an error if cleaning workspace directory', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['../']
                    },
                    dryRun: true,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir: path.resolve(workspaceRoot, 'theout'),
                    logger: new Logger({ logLevel: 'error' })
                });

                await assert.rejects(async () => await runner.run());
            });

            await it('should throw an error if cleaning outside of workspace directory', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['../../dist']
                    },
                    dryRun: true,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir: path.resolve(workspaceRoot, 'theout'),
                    logger: new Logger({ logLevel: 'error' })
                });

                await assert.rejects(async () => await runner.run());
            });

            await it('should throw an error if cleaning outside of output directory', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['../']
                    },
                    dryRun: true,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir: path.resolve(workspaceRoot, 'theout/src'),
                    logger: new Logger({ logLevel: 'error' })
                });

                await assert.rejects(async () => await runner.run());
            });
        });

        await describe('CleanTaskRunner:run [Dry Run]', async () => {
            const outDir = path.resolve(workspaceRoot, 'theout');
            const dryRun = true;

            await it('should delete output directory when cleanOutDir=true', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        cleanOutDir: true
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path);

                assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
            });

            await it('should delete output directory when custom paths include /', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        paths: ['/']
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path);

                assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
            });

            await it('should delete output directory when custom paths include \\', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        paths: ['\\']
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path);

                assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
            });

            await it('should delete output directory when custom paths include .', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        paths: ['.']
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path);

                assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
            });

            await it('should delete with before build clean options', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        paths: ['src', 'path-1/**/*.js', 'path-2/**', '**/index.js']
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path).sort();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'src'),
                    path.resolve(runner.options.outDir, 'path-1/p1.js'),
                    path.resolve(runner.options.outDir, 'path-2'),
                    path.resolve(runner.options.outDir, 'path-2/p2.js'),
                    path.resolve(runner.options.outDir, 'path-2/note.md'),
                    path.resolve(runner.options.outDir, 'path-2/path-3'),
                    path.resolve(runner.options.outDir, 'path-2/path-3/p3.js'),
                    path.resolve(runner.options.outDir, 'index.js')
                ].sort();

                assert.deepStrictEqual(cleanedPaths, expectedPaths);
            });

            await it('should delete with after build clean options', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['src', 'path-1', '**/*.md']
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path).sort();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'README.md'),
                    path.resolve(runner.options.outDir, 'src'),
                    path.resolve(runner.options.outDir, 'src/README.md'),
                    path.resolve(runner.options.outDir, 'src/nested/README.md'),
                    path.resolve(runner.options.outDir, 'path-1'),
                    path.resolve(runner.options.outDir, 'path-2/note.md')
                ].sort();

                assert.deepStrictEqual(cleanedPaths, expectedPaths);
            });

            await it('should respect exclude when cleaning paths - #1', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        cleanOutDir: true,
                        exclude: ['/']
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path).sort();

                assert.deepStrictEqual(cleanedPaths, []);
            });

            await it('should respect exclude when cleaning paths - #2', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        cleanOutDir: true,
                        exclude: ['path-*', 'src/**/*.md']
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path).sort();

                const expectedPaths: string[] = [
                    path.resolve(runner.options.outDir, 'LICENSE'),
                    path.resolve(runner.options.outDir, 'README.md'),
                    path.resolve(runner.options.outDir, 'index.js'),
                    path.resolve(runner.options.outDir, 'src/a.ts'),
                    path.resolve(runner.options.outDir, 'src/b.ts'),
                    path.resolve(runner.options.outDir, 'src/c.ts'),
                    path.resolve(runner.options.outDir, 'src/nested/nested.ts')
                ].sort();

                assert.deepStrictEqual(cleanedPaths, expectedPaths);
            });

            await it('should respect exclude when cleaning paths - #3', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['src'],
                        exclude: ['**/*.md', 'src/a.ts']
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path).sort();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'src/b.ts'),
                    path.resolve(runner.options.outDir, 'src/c.ts'),
                    path.resolve(runner.options.outDir, 'src/nested/nested.ts')
                ].sort();

                assert.deepStrictEqual(cleanedPaths, expectedPaths);
            });

            await it('should respect exclude when cleaning paths - #4', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['path-2'],
                        exclude: ['src/nested/../../../theout/path-*/../path-2/path-3']
                    },
                    dryRun,
                    workspaceInfo: {
                        ...workspaceInfo
                    },
                    outDir,
                    logger: new Logger({ logLevel: 'error' })
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path).sort();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'path-2/note.md'),
                    path.resolve(runner.options.outDir, 'path-2/p2.js')
                ].sort();

                assert.deepStrictEqual(cleanedPaths, expectedPaths);
            });
        });

        await describe('CleanTaskRunner:run [Actual Remove]', async () => {
            await it('should delete output directory when cleanOutDir=true', async () => {
                const tempOutDir = path.resolve(workspaceRoot, 'temp/out-1');
                const dryRun = false;

                // Prepare resources
                fs.mkdirSync(tempOutDir, { recursive: true });
                fs.copyFileSync(path.resolve(workspaceRoot, 'theout/README.md'), path.resolve(tempOutDir, 'README.md'));

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

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path);

                const expectedPaths = [runner.options.outDir];

                for (const cleanedPath of expectedPaths) {
                    const fileExisted = fs.existsSync(cleanedPath);
                    assert.equal(fileExisted, false, `'${cleanedPath}' should be deleted.`);
                }

                assert.deepStrictEqual(cleanedPaths, expectedPaths);
            });
        });
    });
});
