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
        void describe('custom handlers', () => {
            const workspace = './tests/test-data/custom-task/libconfig.json';

            void it(`should show 'Hello!' message when run hello task`, async () => {
                const result = await runCli(`run hello --workspace=${workspace}`);

                assert.match(result, /Hello!/);
            });

            void it(`should show 'Hello exec!' message when run echo task`, async () => {
                const result = await runCli(`run echo --workspace=${workspace}`);

                assert.match(result, /Hello exec!/);
            });
        });

        void describe('invalid config schema', () => {
            const workspace = './tests/test-data/invalid/libconfig-invalid.json';

            void it('should show schema validation error when invalid schema in config file', async () => {
                const result = await runCli(`run build --workspace=${workspace}`);
                const actualLines = result
                    .split(/[\n\r]/)
                    .filter((l) => l.trim().length)
                    .map((l) => l.trim());

                const expectedLine1 = `${path.resolve(
                    process.cwd(),
                    './tests/test-data/invalid/libconfig-invalid.json'
                )} - Configuration validation errors:`;
                const expectedLine2 =
                    'config location: /projects/invalid-project/tasks/build/script - must be array or object.';
                const expectedLine3 =
                    'See more about libconfig.json configuration at https://github.com/DagonMetric/lib-tools/wiki/Lib-Tools-Workspace-Configuration.';

                assert.strictEqual(actualLines.length, 3);
                assert.strictEqual(actualLines[0], expectedLine1);
                assert.strictEqual(actualLines[1], expectedLine2);
                assert.strictEqual(actualLines[2], expectedLine3);
            });
        });
    });
});
