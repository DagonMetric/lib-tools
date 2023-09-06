import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import * as runCommand from '../src/cli/commands/run.js';

void describe('run command builder', () => {
    void it(`should parse command options`, async () => {
        const parser = yargs(hideBin(process.argv)).command(runCommand.command, '', runCommand.builder);
        const result = await parser.parseAsync(
            'run build --logLevel=warn --workspace=tests/test-data --project=a,b --env=prod,ci --outDir=dist --clean=true --copy=README.md,**/*.md --style=styles.scss --script=index.ts --packageVersion=1.0.0',
            () => {
                // Do nothing;
            }
        );

        assert.strictEqual(result.task, 'build');
        assert.strictEqual(result.logLevel, 'warn');
        assert.strictEqual(result.workspace, 'tests/test-data');
        assert.strictEqual(result.project, 'a,b');
        assert.strictEqual(result.env, 'prod,ci');

        assert.strictEqual(result.outDir, 'dist');
        assert.strictEqual(result.clean, true);
        assert.strictEqual(result.copy, 'README.md,**/*.md');
        assert.strictEqual(result.style, 'styles.scss');
        assert.strictEqual(result.script, 'index.ts');
        assert.strictEqual(result.packageVersion, '1.0.0');
    });
});
