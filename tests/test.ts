import { strictEqual } from 'node:assert/strict';
import { exec } from 'node:child_process';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import packageJson from '../package.json' assert { type: 'json' };

const execAsync = promisify(exec);
const packageVersion = packageJson.version;

const runCli = async (args: string) => {
    // execSync(`node ./dist/bin/lib.js ${args}`).toString();
    const { stdout } = await execAsync(`node ./dist/bin/lib.js ${args}`);

    return stdout.toString().trim();
};

void describe('Cli', () => {
    void it(`should show 'help'`, async () => {
        const result = await runCli('--help');

        strictEqual(result.includes('Show help'), true);
    });

    void it(`should show 'version'`, async () => {
        const outputResult = await runCli('--version');

        strictEqual(outputResult, packageVersion);
    });
});
