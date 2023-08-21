import { strictEqual } from 'node:assert/strict';
import { describe, it } from 'node:test';

import { execSync } from 'node:child_process';

const runCli = (args: string) => {
    return execSync(`node ./dist/bin/lib.js ${args}`).toString();
};

void describe('Cli', () => {
    void it(`should run 'help' command`, () => {
        const result = runCli('--help');
        const shouldContains = result.includes('--help  Shows a help message for this command in the console.');

        strictEqual(shouldContains, true);
    });
});
