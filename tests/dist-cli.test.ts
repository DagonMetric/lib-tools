import * as assert from 'node:assert';
import { exec, spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { promisify } from 'node:util';

import packageJson from '../package.json' assert { type: 'json' };

const execAsync = promisify(exec);
const packageVersion = packageJson.version;

const cmdPath = './dist/bin/lib.js';

const runCli = async (args: string) => {
    try {
        const { stderr, stdout } = await execAsync(`node --no-warnings ${cmdPath} ${args}`);

        return stderr ? stderr.toString().trim() : stdout.toString().trim();
    } catch (err) {
        // Line 1: Command failed: node --no-warnings ./dist/bin/lib.js build
        const errLines = (err as Error).message.split('\n');
        return errLines.length > 1 ? errLines.slice(1).join(' ').trim() : errLines.join('\n').trim();
    }
};

void describe('dist/cli', () => {
    beforeEach(async () => {
        const cliExists = await fs
            .access(path.resolve(process.cwd(), cmdPath))
            .then(() => true)
            .catch(() => false);

        if (!cliExists) {
            await new Promise((resolve, reject) => {
                const proc = spawn('npm run build', { stdio: 'inherit', shell: true });
                proc.on('exit', (exitCode) => {
                    resolve(exitCode);
                });
                proc.on('error', (error) => {
                    reject(error);
                });
            });
        }
    });

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
            const result = await runCli('run hello --workspace=./tests/test-data/libconfig.json');
            const actualLines = result
                .split(/[\n\r]/)
                .filter((l) => l.trim().length)
                .map((l) => l.trim());

            const expectedLine1 = 'Executing test-project/hello task';
            const expectedLine2 = `Hello!`;
            const expectedLine3 = 'Executing test-project/hello task completed.';

            assert.strictEqual(actualLines.length, 3);
            assert.strictEqual(actualLines[0], expectedLine1);
            assert.strictEqual(actualLines[1], expectedLine2);
            assert.strictEqual(actualLines[2], expectedLine3);
        });

        void it('should show Hello exec! message when run echo task', async () => {
            const result = await runCli('run echo --workspace=./tests/test-data/libconfig.json');
            const actualLines = result
                .split(/[\n\r]/)
                .filter((l) => l.trim().length)
                .map((l) => l.trim());

            const expectedLine1 = 'Executing test-project/echo task: echo "Hello exec!"';
            const expectedLine2 = `"Hello exec!"`;
            const expectedLine3 = 'Executing test-project/echo task completed.';

            assert.strictEqual(actualLines.length, 3);
            assert.strictEqual(actualLines[0], expectedLine1);
            assert.strictEqual(actualLines[1], expectedLine2);
            assert.strictEqual(actualLines[2], expectedLine3);
        });
    });
});
