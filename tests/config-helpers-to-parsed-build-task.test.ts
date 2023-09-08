import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { toParsedBuildTask, validateOutDir } from '../src/config-helpers/to-parsed-build-task.js';

import { InvalidConfigError } from '../src/exceptions/index.js';
import { BuildTask } from '../src/models/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../src/models/parsed/index.js';

void describe('config-helpers/toParsedBuildTask', () => {
    void it('should parse build task config', () => {
        const buildTask: BuildTask = {
            outDir: 'out',
            clean: true,
            script: ['a.js', 'b.ts']
        };

        const workspaceInfo: WorkspaceInfo = {
            workspaceRoot: process.cwd(),
            projectRoot: process.cwd(),
            projectName: 'test-project',
            configPath: null
        };

        const result = toParsedBuildTask(buildTask, workspaceInfo, null, null);

        const expected: ParsedBuildTask = {
            ...buildTask,
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _packageJsonInfo: null,
            _outDir: path.resolve(process.cwd(), 'out')
        };

        assert.deepStrictEqual(result, expected);
    });

    void it('should parse build task config with cmd options outDir', () => {
        const buildTask: BuildTask = {
            clean: true,
            script: ['a.js', 'b.ts']
        };

        const workspaceInfo: WorkspaceInfo = {
            workspaceRoot: process.cwd(),
            projectRoot: process.cwd(),
            projectName: 'test-project',
            configPath: null
        };

        const cmdOptionsOutDir = path.resolve(process.cwd(), 'dist');

        const result = toParsedBuildTask(buildTask, workspaceInfo, null, cmdOptionsOutDir);

        const expected: ParsedBuildTask = {
            ...buildTask,
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _packageJsonInfo: null,
            _outDir: cmdOptionsOutDir
        };

        assert.deepStrictEqual(result, expected);
    });
});

void describe('config-helpers/to-parsed-build-task/validateOutDir', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data');
    const workspaceInfo: WorkspaceInfo = {
        workspaceRoot,
        projectRoot: path.resolve(workspaceRoot, 'test-project'),
        projectName: 'test-project',
        configPath: path.resolve(workspaceRoot, 'libconfig.json')
    };

    const configLocationPrefix = `projects[${workspaceInfo.projectName}].tasks.build`;

    void it(
        'should throw an error if outDir is system root directory - C:\\ on Windows',
        { skip: process.platform !== 'win32' },
        () => {
            const outDir = path.resolve('C:\\');
            const expectedError = new InvalidConfigError(
                `The 'outDir' must not be system root directory.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}.outDir`
            );

            assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
        }
    );

    void it('should throw an error if outDir is system root directory - /', () => {
        const outDir = path.resolve('/');
        const expectedError = new InvalidConfigError(
            `The 'outDir' must not be system root directory.`,
            workspaceInfo.configPath,
            `${configLocationPrefix}.outDir`
        );

        assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
    });

    void it(
        'should throw an error if outDir is system root directory - \\\\server\\public on Windows',
        { skip: process.platform !== 'win32' },
        () => {
            const outDir = path.resolve('\\\\server\\public');
            const expectedError = new InvalidConfigError(
                `The 'outDir' must not be system root directory.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}.outDir`
            );

            assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
        }
    );

    void it(
        'should throw an error if outDir is system root directory - //server/public on Windows',
        { skip: process.platform !== 'win32' },
        () => {
            const outDir = path.resolve('//server/public');
            const expectedError = new InvalidConfigError(
                `The 'outDir' must not be system root directory.`,
                workspaceInfo.configPath,
                `${configLocationPrefix}.outDir`
            );

            assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
        }
    );

    void it('should throw an error if outDir is parent of workspace root', () => {
        const outDir = path.resolve(workspaceRoot, '../');
        const expectedError = new InvalidConfigError(
            `The 'outDir' must not be parent of worksapce root or current working directory.`,
            workspaceInfo.configPath,
            `${configLocationPrefix}.outDir`
        );

        assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
    });

    void it('should throw an error if outDir is parent of project root', () => {
        const outDir = path.resolve(workspaceInfo.projectRoot, '../');
        const expectedError = new InvalidConfigError(
            `The 'outDir' must not be parent of project root directory.`,
            workspaceInfo.configPath,
            `${configLocationPrefix}.outDir`
        );

        assert.throws(() => validateOutDir(outDir, workspaceInfo), expectedError);
    });
});
