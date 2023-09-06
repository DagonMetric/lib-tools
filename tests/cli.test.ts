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

void describe('CLI', () => {
    void describe('lib --help', () => {
        void it(`should show help if '--help' option is passed`, async () => {
            const result = await runCli('--help');
            const expected = 'Show help';
            assert.match(result, new RegExp(expected), `Should contains '${expected}'`);
        });
    });

    void describe('lib --version', () => {
        void it(`should show version if '--version' option is passed`, async () => {
            const result = await runCli('--version');
            assert.strictEqual(result, packageVersion);
        });
    });

    void describe('lib run <task>', () => {
        void it('should show Hello! message when run hello task', async () => {
            const result = await runCli('run hello --workspace=./tests/test-data/libconfig.json --logLevel=info');
            const expected = `Hello!`;
            assert.match(result, new RegExp(expected), `Should contains '${expected}'`);
        });

        void it('should show Hello exec! message when run echo task', async () => {
            const result = await runCli('run echo --workspace=./tests/test-data/libconfig.json --logLevel=warn');
            const expected = `Hello exec!`;
            assert.match(result, new RegExp(expected), `Should contains '${expected}'`);
        });
    });
});
