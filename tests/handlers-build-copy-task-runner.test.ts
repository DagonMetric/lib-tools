import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { CopyEntry } from '../src/config-models/index.js';
import { BuildTask } from '../src/handlers/build-task.js';
import { CopyTaskRunner, getCopyTaskRunner } from '../src/handlers/internals/build/copy/index.js';
import { Logger } from '../src/utils/index.js';

void describe('handlers/internals/build/copy', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/copy');

    void describe('getCopyTaskRunner', () => {
        void it('should not get runner when empty copy entry', () => {
            const buildTask: BuildTask = {
                taskName: 'build',
                taskCategory: 'build',
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'copy-project',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                copy: []
            };

            const runner = getCopyTaskRunner(buildTask, {
                dryRun: true,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
            });

            assert.equal(runner, null);
        });

        void it('should not get runner when no valid copy entry', () => {
            const buildTask: BuildTask = {
                taskName: 'build',
                taskCategory: 'build',
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'copy-project',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                copy: [' ', { from: ' ' }]
            };

            const runner = getCopyTaskRunner(buildTask, {
                dryRun: true,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
            });

            assert.equal(runner, null);
        });

        void it('should get runner with string entry array', () => {
            const buildTask: BuildTask = {
                taskName: 'build',
                taskCategory: 'build',
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'copy-project',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                copy: ['a.txt', 'b.txt', '**/*.md']
            };

            const runner = getCopyTaskRunner(buildTask, {
                dryRun: true,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
            });

            const expectedCopyEntries: CopyEntry[] = [
                {
                    from: 'a.txt'
                },
                {
                    from: 'b.txt'
                },
                {
                    from: '**/*.md'
                }
            ];

            assert.ok(runner);
            assert.equal(runner.options.dryRun, true);
            assert.deepStrictEqual(runner.options.copyEntries, expectedCopyEntries);
        });

        void it('should get runner with object entry array', () => {
            const buildTask: BuildTask = {
                taskName: 'build',
                taskCategory: 'build',
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'copy-project',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                copy: [
                    {
                        from: 'a.txt'
                    },
                    {
                        from: 'b.txt',
                        to: 'dist/b.txt'
                    },
                    {
                        from: '**/*.md',
                        to: 'dist',
                        exclude: ['README.md']
                    }
                ]
            };

            const runner = getCopyTaskRunner(buildTask, {
                dryRun: false,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
            });

            const expectedCopyEntries: CopyEntry[] = [
                {
                    from: 'a.txt'
                },
                {
                    from: 'b.txt',
                    to: 'dist/b.txt'
                },
                {
                    from: '**/*.md',
                    to: 'dist',
                    exclude: ['README.md']
                }
            ];

            assert.ok(runner);
            assert.equal(runner.options.dryRun, false);
            assert.deepStrictEqual(runner.options.copyEntries, expectedCopyEntries);
        });

        void it('should get runner with string and object mixed entry array', () => {
            const buildTask: BuildTask = {
                taskName: 'build',
                taskCategory: 'build',
                workspaceRoot,
                projectRoot: workspaceRoot,
                projectName: 'copy-project',
                configPath: null,

                outDir: path.resolve(workspaceRoot, 'theout'),
                copy: [
                    'a.txt',
                    {
                        from: 'b.txt',
                        to: 'dist/b.txt'
                    },
                    {
                        from: '**/*.md',
                        to: 'dist',
                        exclude: ['README.md']
                    }
                ]
            };

            const runner = getCopyTaskRunner(buildTask, {
                dryRun: false,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
            });
            const expectedCopyEntries: CopyEntry[] = [
                {
                    from: 'a.txt'
                },
                {
                    from: 'b.txt',
                    to: 'dist/b.txt'
                },
                {
                    from: '**/*.md',
                    to: 'dist',
                    exclude: ['README.md']
                }
            ];

            assert.ok(runner);
            assert.equal(runner.options.dryRun, false);
            assert.deepStrictEqual(runner.options.copyEntries, expectedCopyEntries);
        });
    });

    void describe('CopyTaskRunner', { skip: process.platform === 'linux' }, () => {
        void describe('CopyTaskRunner:run [Dry Run]', () => {
            const outDir = path.resolve(workspaceRoot, 'dist');
            const dryRun = true;

            void it('should copy single file to output directory', async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: 'README.md'
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                const expectedPaths = [path.resolve(runner.options.outDir, 'README.md')];

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort(),
                    expectedPaths.sort()
                );
            });

            void it('should copy directory contents to output directory', async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: 'src/path-2/path-3'
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                const expectedPaths = [path.resolve(runner.options.outDir, 'p3.js')];

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort(),
                    expectedPaths.sort()
                );
            });

            void it('should copy with glob pattern', async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: 'src/path-2/**/*'
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'p2.js'),
                    path.resolve(runner.options.outDir, 'note.md'),
                    path.resolve(runner.options.outDir, 'path-3/p3.js')
                ];

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort(),
                    expectedPaths.sort()
                );
            });

            void it('should copy with from and to options', async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: 'src/path-1',
                            to: 'p1'
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                const expectedPaths = [path.resolve(runner.options.outDir, 'p1/p1.js')];

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort(),
                    expectedPaths.sort()
                );
            });

            void it("should copy when from is project root '.'", async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: '.',
                            exclude: ['src']
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'README.md'),
                    path.resolve(runner.options.outDir, 'LICENSE'),
                    path.resolve(runner.options.outDir, 'index.ts')
                ];

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort(),
                    expectedPaths.sort()
                );
            });

            void it("should copy when from is project root '/'", async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: '/',
                            exclude: ['src']
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'README.md'),
                    path.resolve(runner.options.outDir, 'LICENSE'),
                    path.resolve(runner.options.outDir, 'index.ts')
                ];

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort(),
                    expectedPaths.sort()
                );
            });

            void it("should copy and repect exclude folder 'src'", async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: '/',
                            exclude: ['src']
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'README.md'),
                    path.resolve(runner.options.outDir, 'LICENSE'),
                    path.resolve(runner.options.outDir, 'index.ts')
                ];

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort(),
                    expectedPaths.sort()
                );
            });

            void it("should copy and repect exclude pattern: '**/*.md'", async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: 'src/path-*',
                            exclude: ['**/*.md']
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'path-1/p1.js'),
                    path.resolve(runner.options.outDir, 'path-2/p2.js'),
                    path.resolve(runner.options.outDir, 'path-2/path-3/p3.js')
                ];

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort(),
                    expectedPaths.sort()
                );
            });

            void it("should copy and repect exclude pattern: '**/path-*'", async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: 'src',
                            exclude: ['**/path-*']
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                const expectedPaths = [
                    path.resolve(runner.options.outDir, 'README.md'),
                    path.resolve(runner.options.outDir, 'a.ts'),
                    path.resolve(runner.options.outDir, 'b.ts'),
                    path.resolve(runner.options.outDir, 'c.ts')
                ];

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort(),
                    expectedPaths.sort()
                );
            });

            void it('should not copy when from and exclude is same path', async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [
                        {
                            from: '.',
                            exclude: ['/']
                        }
                    ],
                    buildTask: {
                        taskName: 'build',
                        taskCategory: 'build',
                        workspaceRoot,
                        projectRoot: workspaceRoot,
                        projectName: 'copy-project',
                        configPath: null,
                        outDir
                    },
                    outDir,
                    dryRun,
                    logger: new Logger({ logLevel: 'error' }),
                    logLevel: 'error',
                    env: undefined
                });

                const copyResult = await runner.run();

                assert.deepStrictEqual(
                    copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to),
                    []
                );
            });
        });
    });

    void describe('CopyTaskRunner:run [Actual Copy]', { skip: process.platform === 'linux' }, () => {
        const outDir = path.resolve(workspaceRoot, 'dist');
        const dryRun = false;

        void afterEach(() => {
            // Clean resources
            const tempOutDirexisted = fs.existsSync(outDir);
            if (tempOutDirexisted) {
                fs.rmdirSync(outDir, { recursive: true });
            }
        });

        void it('should copy single file to output directory', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: 'README.md'
                    },
                    {
                        from: 'README.md'
                    }
                ],
                buildTask: {
                    taskName: 'build',
                    taskCategory: 'build',
                    workspaceRoot,
                    projectRoot: workspaceRoot,
                    projectName: 'copy-project',
                    configPath: null,
                    outDir
                },
                outDir,
                dryRun,
                logger: new Logger({ logLevel: 'error' }),
                logLevel: 'error',
                env: undefined
            });

            const copyResult = await runner.run();
            const copiedPaths = copyResult.copiedFileInfoes.map((fileInfo) => fileInfo.to).sort();

            const expectedPaths = [path.resolve(runner.options.outDir, 'README.md')].sort();
            for (const coppiedPath of expectedPaths) {
                const fileExisted = fs.existsSync(coppiedPath);
                assert.equal(fileExisted, true, `'${coppiedPath}' should be existed.`);
            }

            assert.deepStrictEqual(copiedPaths, expectedPaths);
        });
    });
});
