import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { AfterBuildCleanOptions, BeforeBuildCleanOptions } from '../src/config-models/index.js';
import { BuildTask } from '../src/handlers/build-task.js';
import { CleanTaskRunner, getCleanTaskRunner } from '../src/handlers/internals/build/clean/index.js';
import { Logger } from '../src/utils/index.js';

void describe('handlers/internals/build/clean', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/clean');

    void describe('getCleanTaskRunner', () => {
        void it('should not get runner when clean=false', () => {
            const buildTask: BuildTask = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                taskName: 'build',
                taskCategory: 'build',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                clean: false
            };

            const runner = getCleanTaskRunner('before', buildTask, {
                dryRun: true,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
            });

            assert.equal(runner, null);
        });

        void it('should not get runner when no valid clean entry', () => {
            const buildTask: BuildTask = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                taskName: 'build',
                taskCategory: 'build',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                clean: {
                    beforeBuild: {
                        paths: [' ']
                    }
                }
            };

            const runner = getCleanTaskRunner('before', buildTask, {
                dryRun: true,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
            });

            assert.equal(runner, null);
        });

        void it('should get runner with before build clean options when clean=true', () => {
            const buildTask: BuildTask = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                taskName: 'build',
                taskCategory: 'build',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                clean: true
            };

            const runner = getCleanTaskRunner('before', buildTask, {
                dryRun: true,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
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

            const buildTask: BuildTask = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                taskName: 'build',
                taskCategory: 'build',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                clean: {
                    beforeBuild: beforeBuildCleanOptions
                }
            };

            const runner = getCleanTaskRunner('before', buildTask, {
                dryRun: false,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
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

            const buildTask: BuildTask = {
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'clean-project',
                taskName: 'build',
                taskCategory: 'build',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                clean: {
                    afterBuild: afterBuildCleanOptions
                }
            };

            const runner = getCleanTaskRunner('after', buildTask, {
                dryRun: false,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
            });

            assert.ok(runner != null);
            assert.equal(runner.options.dryRun, false);
            assert.equal(runner.options.runFor, 'after');
            assert.deepStrictEqual(runner.options.beforeOrAfterCleanOptions, afterBuildCleanOptions);
        });
    });

    void describe('CleanTaskRunner', { skip: process.platform === 'linux' }, () => {
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
                        buildTask: {
                            workspaceRoot,
                            projectRoot: workspaceRoot,
                            projectName: 'clean-project',
                            taskName: 'build',
                            taskCategory: 'build',
                            configPath: null,
                            outDir: path.resolve(workspaceRoot, 'theout')
                        },
                        dryRun: true,
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' }),
                        env: undefined,
                        logLevel: 'error'
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
                        buildTask: {
                            workspaceRoot,
                            projectRoot: workspaceRoot,
                            projectName: 'clean-project',
                            taskName: 'build',
                            taskCategory: 'build',
                            configPath: null,
                            outDir: path.resolve(workspaceRoot, 'theout')
                        },
                        dryRun: true,
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' }),
                        env: undefined,
                        logLevel: 'error'
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
                        buildTask: {
                            workspaceRoot,
                            projectRoot: workspaceRoot,
                            projectName: 'clean-project',
                            taskName: 'build',
                            taskCategory: 'build',
                            configPath: null,
                            outDir: path.resolve(workspaceRoot, 'theout')
                        },
                        dryRun: true,
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' }),
                        env: undefined,
                        logLevel: 'error'
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
                        buildTask: {
                            workspaceRoot,
                            projectRoot: workspaceRoot,
                            projectName: 'clean-project',
                            taskName: 'build',
                            taskCategory: 'build',
                            configPath: null,
                            outDir: path.resolve(workspaceRoot, 'theout')
                        },
                        dryRun: true,
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' }),
                        env: undefined,
                        logLevel: 'error'
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
                        buildTask: {
                            workspaceRoot,
                            projectRoot: workspaceRoot,
                            projectName: 'clean-project',
                            taskName: 'build',
                            taskCategory: 'build',
                            configPath: null,
                            outDir: path.resolve(workspaceRoot, 'theout')
                        },
                        dryRun: true,
                        outDir: path.resolve(workspaceRoot, 'theout'),
                        logger: new Logger({ logLevel: 'error' }),
                        env: undefined,
                        logLevel: 'error'
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
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir: path.resolve(workspaceRoot, 'theout')
                    },
                    dryRun: true,
                    outDir: path.resolve(workspaceRoot, 'theout'),
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
                });

                await assert.rejects(async () => await runner.run());
            });

            void it('should throw an error if cleaning outside of workspace directory', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['../../dist']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir: path.resolve(workspaceRoot, 'theout')
                    },
                    dryRun: true,
                    outDir: path.resolve(workspaceRoot, 'theout'),
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
                });

                await assert.rejects(async () => await runner.run());
            });

            void it('should throw an error if cleaning outside of output directory', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['../']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir: path.resolve(workspaceRoot, 'theout')
                    },
                    dryRun: true,
                    outDir: path.resolve(workspaceRoot, 'theout'),
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
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
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path);

                assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
            });

            void it('should delete output directory when custom paths include /', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        paths: ['/']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path);

                assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
            });

            void it('should delete output directory when custom paths include \\', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        paths: ['\\']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path);

                assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
            });

            void it('should delete output directory when custom paths include .', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        paths: ['.']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path);

                assert.deepStrictEqual(cleanedPaths, [runner.options.outDir]);
            });

            void it('should delete with before build clean options', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        paths: ['src', 'path-1/**/*.js', 'path-2/**', '**/index.js']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
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

            void it('should delete with after build clean options', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['src', 'path-1', '**/*.md']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
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

            void it('should respect exclude when cleaning paths - #1', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        cleanOutDir: true,
                        exclude: ['/']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
                });

                const cleanResult = await runner.run();
                const cleanedPaths = cleanResult.cleanedPathInfoes.map((pathInfo) => pathInfo.path).sort();

                assert.deepStrictEqual(cleanedPaths, []);
            });

            void it('should respect exclude when cleaning paths - #2', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'before',
                    beforeOrAfterCleanOptions: {
                        cleanOutDir: true,
                        exclude: ['path-*', 'src/**/*.md']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
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

            void it('should respect exclude when cleaning paths - #3', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['src'],
                        exclude: ['**/*.md', 'src/a.ts']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
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

            void it('should respect exclude when cleaning paths - #4', async () => {
                const runner = new CleanTaskRunner({
                    runFor: 'after',
                    beforeOrAfterCleanOptions: {
                        paths: ['path-2'],
                        exclude: ['src/nested/../../../theout/path-*/../path-2/path-3']
                    },
                    buildTask: {
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'clean-project',
                        taskName: 'build',
                        taskCategory: 'build',
                        configPath: null,
                        outDir
                    },
                    dryRun,
                    outDir,
                    logger: new Logger({ logLevel: 'error' }),
                    env: undefined,
                    logLevel: 'error'
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
    });

    void describe('CleanTaskRunner:run [Actual Remove]', { skip: process.platform === 'linux' }, () => {
        const tempOutDir = path.resolve(workspaceRoot, 'temp-out');
        const dryRun = false;

        beforeEach(() => {
            // Prepare resources
            fs.mkdirSync(tempOutDir, { recursive: true });
            fs.copyFileSync(path.resolve(workspaceRoot, 'theout/README.md'), path.resolve(tempOutDir, 'README.md'));
        });

        afterEach(() => {
            // Clean resources
            const tempOutDirexisted = fs.existsSync(tempOutDir);
            if (tempOutDirexisted) {
                fs.rmdirSync(tempOutDir, { recursive: true });
            }
        });

        void it('should delete output directory when cleanOutDir=true', async () => {
            const runner = new CleanTaskRunner({
                runFor: 'before',
                beforeOrAfterCleanOptions: {
                    cleanOutDir: true
                },

                buildTask: {
                    workspaceRoot,
                    projectRoot: workspaceRoot,
                    projectName: 'clean-project',
                    taskName: 'build',
                    taskCategory: 'build',
                    configPath: null,
                    outDir: tempOutDir
                },
                dryRun,
                outDir: tempOutDir,
                logger: new Logger({ logLevel: 'error' }),
                env: undefined,
                logLevel: 'error'
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
