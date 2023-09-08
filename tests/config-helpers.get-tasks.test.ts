import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { getTasks } from '../src/config-helpers/get-tasks.js';

import { CommandOptions } from '../src/models/index.js';
import { ParsedBuildTask } from '../src/models/parsed/index.js';

void describe('config-helpers/getTasks', () => {
    void it('should return build task from cmd options', async () => {
        const cmdOptions: CommandOptions = {
            workspace: './tests/test-data/libconfig.json',
            outDir: 'dist',
            env: 'prod ,ci',
            project: 'a,b , c',
            copy: 'README.md, **/*.js',
            clean: true,
            style: 'styles.scss , styles.scss',
            script: 'index.ts, index.ts',
            packageVersion: '3.0.0',
            logLevel: 'info'
        };

        const result = await getTasks(cmdOptions);

        const expected: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: {
                workspaceRoot: path.resolve(process.cwd(), './tests/test-data'),
                projectRoot: path.resolve(process.cwd(), './tests/test-data'),
                projectName: null,
                configPath: path.resolve(process.cwd(), './tests/test-data/libconfig.json')
            },
            _packageJsonInfo: null,
            _outDir: path.resolve(process.cwd(), './tests/test-data/dist'),
            clean: true,
            copy: ['README.md', '**/*.js'],
            style: ['styles.scss'],
            script: ['index.ts'],
            packageJson: {
                packageVersion: '3.0.0'
            }
        };

        assert.equal(result.length, 1);
        assert.deepStrictEqual(result[0], expected);
    });
});
