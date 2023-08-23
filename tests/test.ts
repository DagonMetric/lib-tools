import * as assert from 'node:assert';
import { exec } from 'node:child_process';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import packageJson from '../package.json' assert { type: 'json' };

const execAsync = promisify(exec);
const packageVersion = packageJson.version;

const runCli = async (args: string) => {
    try {
        const { stderr, stdout } = await execAsync(`node --no-warnings ./dist/bin/lib.js ${args}`);

        return stderr ? stderr.toString().trim() : stdout.toString().trim();
    } catch (err) {
        // Line 1: Command failed: node --no-warnings ./dist/bin/lib.js build
        const errLines = (err as Error).message.split('\n');
        return errLines.length > 1 ? errLines.slice(1).join(' ').trim() : errLines.join(' ').trim();
    }
};

void describe('CLI Integration Tests', () => {
    void it(`should show help if '--help' option is passed`, async () => {
        const result = await runCli('--help');
        const expected = 'Show help';
        assert.match(result, new RegExp(expected), `Should contains '${expected}'`);
    });

    void it(`should show version if '--version' option is passed`, async () => {
        const result = await runCli('--version');
        assert.strictEqual(result, packageVersion);
    });

    void it('should show warning message if no build task is found', async () => {
        const result = await runCli('build');
        const expected = 'Warning: No task to build.';
        assert.strictEqual(result, expected);
    });

    void it(`should show usage message if 'build --help' command is passed`, async () => {
        const result = await runCli('build --help');
        const expected = 'Show help for build command';
        assert.match(result, new RegExp(expected), `Should contains '${expected}'`);
    });
});
