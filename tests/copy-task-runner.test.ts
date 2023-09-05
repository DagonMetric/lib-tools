import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { CopyTaskRunner, getCopyTaskRunner } from '../src/handlers/build/copy/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../src/helpers/index.js';
import { CopyEntry } from '../src/models/index.js';
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
});
