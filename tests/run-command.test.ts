import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import * as runCommand from '../src/cli/commands/run.js';

void describe('run command builder', () => {
    void it(`should parse command options`, async () => {
        const parser = yargs(hideBin(process.argv)).command(runCommand.command, '', runCommand.builder);
        const result = await parser.parseAsync(
            'run build --env=prod,ci --project=a,b --clean=true --copy=README.md,**/*.md --style=styles.scss --script=index.ts',
            () => {
                // Do nothing;
            }
        );
        assert.strictEqual(result.env, 'prod,ci');
        assert.strictEqual(result.project, 'a,b');
        assert.strictEqual(result.clean, true);
        assert.strictEqual(result.copy, 'README.md,**/*.md');
        assert.strictEqual(result.style, 'styles.scss');
        assert.strictEqual(result.script, 'index.ts');
    });
});
