import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { CopyTaskRunner, getCopyTaskRunner } from '../src/handlers/build/copy/index.js';
import { CopyEntry } from '../src/models/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../src/models/parsed/index.js';
import { Logger } from '../src/utils/index.js';

void describe('getCopyTaskRunner', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/copy-project');
    const workspaceInfo: WorkspaceInfo = {
        workspaceRoot,
        projectRoot: workspaceRoot,
        projectName: 'copy-project',
        configPath: null
    };

    void it('should not get runner when empty copy entry', () => {
        const buildTask: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _outDir: path.resolve(workspaceRoot, 'theout'),
            _packageJsonInfo: null,
            copy: []
        };

        const runner = getCopyTaskRunner(buildTask, new Logger({ logLevel: 'error' }));

        assert.equal(runner, null);
    });

    void it('should not get runner when no valid copy entry', () => {
        const buildTask: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _outDir: path.resolve(workspaceRoot, 'theout'),
            _packageJsonInfo: null,
            copy: [' ', { from: ' ' }]
        };

        const runner = getCopyTaskRunner(buildTask, new Logger({ logLevel: 'error' }));

        assert.equal(runner, null);
    });

    void it('should get runner with string entry array', () => {
        const buildTask: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _outDir: path.resolve(workspaceRoot, 'theout'),
            _packageJsonInfo: null,
            copy: ['a.txt', 'b.txt', '**/*.md']
        };

        const runner = getCopyTaskRunner(buildTask, new Logger({ logLevel: 'error' }), true);

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
        const buildTask: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _outDir: path.resolve(workspaceRoot, 'theout'),
            _packageJsonInfo: null,
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

        const runner = getCopyTaskRunner(buildTask, new Logger({ logLevel: 'error' }), false);

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
        const buildTask: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _outDir: path.resolve(workspaceRoot, 'theout'),
            _packageJsonInfo: null,
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

        const runner = getCopyTaskRunner(buildTask, new Logger({ logLevel: 'error' }));

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

void describe('CopyTaskRunner', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/copy-project');
    const outDir = path.resolve(workspaceRoot, 'dist');
    const workspaceInfo: WorkspaceInfo = {
        workspaceRoot,
        projectRoot: workspaceRoot,
        projectName: 'copy-project',
        configPath: null
    };

    void describe('CopyTaskRunner:run [Validation outDir]', () => {
        void it('should throw an error if outDir is empty', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [{ from: 'a.txt' }],
                dryRun: true,
                workspaceInfo,
                outDir: ' ',
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it(
            'should throw an error if outDir is system root directory - C:\\ on Windows',
            { skip: process.platform !== 'win32' },
            async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [{ from: 'a.txt' }],
                    dryRun: true,
                    workspaceInfo,
                    outDir: path.resolve('C:\\'),
                    logger: new Logger({ logLevel: 'error' })
                });

                await assert.rejects(async () => await runner.run());
            }
        );

        void it('should throw an error if outDir is system root directory - /', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [{ from: 'a.txt' }],
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve('/'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it(
            'should throw an error if outDir is unc root directory - \\\\server\\public on Windows',
            { skip: process.platform !== 'win32' },
            async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [{ from: 'a.txt' }],
                    dryRun: true,
                    workspaceInfo,
                    outDir: path.resolve('\\\\server\\public'),
                    logger: new Logger({ logLevel: 'error' })
                });

                await assert.rejects(async () => await runner.run());
            }
        );

        void it(
            'should throw an error if outDir is unc root directory - //server/public on Windows',
            { skip: process.platform !== 'win32' },
            async () => {
                const runner = new CopyTaskRunner({
                    copyEntries: [{ from: 'a.txt' }],
                    dryRun: true,
                    workspaceInfo,
                    outDir: path.resolve('//server/public'),
                    logger: new Logger({ logLevel: 'error' })
                });

                await assert.rejects(async () => await runner.run());
            }
        );

        void it('should throw an error if outDir is parent of workspace root', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [{ from: 'a.txt' }],
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceRoot, '../'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });

        void it('should throw an error if outDir is parent of project root', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [{ from: 'a.txt' }],
                dryRun: true,
                workspaceInfo,
                outDir: path.resolve(workspaceInfo.projectRoot, '../'),
                logger: new Logger({ logLevel: 'error' })
            });

            await assert.rejects(async () => await runner.run());
        });
    });

    void describe('CopyTaskRunner:run [Dry Run]', () => {
        const dryRun = true;

        void it('should copy single file to output directory', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: 'README.md'
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [path.resolve(runner.options.outDir, 'README.md')];

            assert.deepStrictEqual(copiedPaths, expectedPaths);
        });

        void it('should copy directory contents to output directory', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: 'src/path-2/path-3'
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [path.resolve(runner.options.outDir, 'p3.js')];

            assert.deepStrictEqual(copiedPaths, expectedPaths);
        });

        void it('should copy with glob pattern', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: 'src/path-2/**/*'
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [
                path.resolve(runner.options.outDir, 'p2.js'),
                path.resolve(runner.options.outDir, 'note.md'),
                path.resolve(runner.options.outDir, 'path-3/p3.js')
            ];

            assert.deepStrictEqual(copiedPaths.sort(), expectedPaths.sort());
        });

        void it('should copy with from and to options', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: 'src/path-1',
                        to: 'p1'
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [path.resolve(runner.options.outDir, 'p1/p1.js')];

            assert.deepStrictEqual(copiedPaths, expectedPaths);
        });

        void it("should copy when from is project root '.'", async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: '.',
                        exclude: ['src']
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [
                path.resolve(runner.options.outDir, 'README.md'),
                path.resolve(runner.options.outDir, 'LICENSE'),
                path.resolve(runner.options.outDir, 'index.ts')
            ];

            assert.deepStrictEqual(copiedPaths.sort(), expectedPaths.sort());
        });

        void it("should copy when from is project root '/'", async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: '/',
                        exclude: ['src']
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [
                path.resolve(runner.options.outDir, 'README.md'),
                path.resolve(runner.options.outDir, 'LICENSE'),
                path.resolve(runner.options.outDir, 'index.ts')
            ];

            assert.deepStrictEqual(copiedPaths.sort(), expectedPaths.sort());
        });

        void it("should copy and repect exclude folder 'src'", async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: '/',
                        exclude: ['src']
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [
                path.resolve(runner.options.outDir, 'README.md'),
                path.resolve(runner.options.outDir, 'LICENSE'),
                path.resolve(runner.options.outDir, 'index.ts')
            ];

            assert.deepStrictEqual(copiedPaths.sort(), expectedPaths.sort());
        });

        void it("should copy and repect exclude pattern: '**/*.md'", async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: 'src/path-*',
                        exclude: ['**/*.md']
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [
                path.resolve(runner.options.outDir, 'path-1/p1.js'),
                path.resolve(runner.options.outDir, 'path-2/p2.js'),
                path.resolve(runner.options.outDir, 'path-2/path-3/p3.js')
            ];

            assert.deepStrictEqual(copiedPaths.sort(), expectedPaths.sort());
        });

        void it("should copy and repect exclude pattern: '**/path-*'", async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: 'src',
                        exclude: ['**/path-*']
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [
                path.resolve(runner.options.outDir, 'README.md'),
                path.resolve(runner.options.outDir, 'a.ts'),
                path.resolve(runner.options.outDir, 'b.ts'),
                path.resolve(runner.options.outDir, 'c.ts')
            ];

            assert.deepStrictEqual(copiedPaths.sort(), expectedPaths.sort());
        });

        void it('should not copy when from and exclude is same path', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: '.',
                        exclude: ['/']
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            assert.deepStrictEqual(copiedPaths, []);
        });
    });

    void describe('CopyTaskRunner:run [Actual Copy]', () => {
        const dryRun = false;

        afterEach(async () => {
            await fs
                .access(outDir)
                .then(async () => {
                    await fs.rm(outDir, {
                        recursive: true,
                        force: true
                    });
                })
                .catch(() => {
                    // Do nothing
                });
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
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [path.resolve(runner.options.outDir, 'README.md')];
            for (const coppiedPath of expectedPaths) {
                const fileExisted = await fs
                    .access(coppiedPath)
                    .then(() => true)
                    .catch(() => false);
                assert.equal(fileExisted, true, `'${coppiedPath}' should be existed.`);
            }

            assert.deepStrictEqual(copiedPaths, expectedPaths);
        });

        void it('should copy directory contents to output directory', async () => {
            const runner = new CopyTaskRunner({
                copyEntries: [
                    {
                        from: 'src/path-2/path-3'
                    },
                    {
                        from: 'src/path-2/path-3'
                    }
                ],
                dryRun,
                workspaceInfo,
                outDir,
                logger: new Logger({ logLevel: 'error' })
            });

            const copiedPaths = await runner.run();

            const expectedPaths = [path.resolve(runner.options.outDir, 'p3.js')];
            for (const coppiedPath of expectedPaths) {
                const fileExisted = await fs
                    .access(coppiedPath)
                    .then(() => true)
                    .catch(() => false);
                assert.equal(fileExisted, true, `'${coppiedPath}' should be existed.`);
            }

            assert.deepStrictEqual(copiedPaths, expectedPaths);
        });
    });
});
