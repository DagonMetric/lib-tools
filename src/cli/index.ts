import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { colors, findUp } from '../utils/index.js';

import * as runCommand from './commands/run.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function (): Promise<void> {
    const packageJsonPath = await findUp(
        'package.json',
        path.resolve(__dirname, '../'),
        path.resolve(__dirname, '../../')
    );

    if (!packageJsonPath) {
        throw new Error('Could not find package.json file.');
    }

    const content = await fs.readFile(packageJsonPath, { encoding: 'utf-8' });
    const packageJson = JSON.parse(content) as { version: string };
    const packageVersion = packageJson.version;

    const yargsInstance = yargs(hideBin(process.argv));
    await yargsInstance
        .scriptName('lib')
        .parserConfiguration({
            'populate--': true,
            'unknown-options-as-args': false,
            'dot-notation': false,
            'boolean-negation': true,
            'strip-aliased': true,
            'strip-dashed': true,
            'camel-case-expansion': false
        })
        .updateStrings({
            'Commands:': colors.cyan('Commands:'),
            'Options:': colors.cyan('Options:'),
            'Positionals:': colors.cyan('Arguments:'),
            'Examples:': colors.cyan('Examples:'),
            deprecated: colors.yellow('deprecated'),
            'deprecated: %s': colors.yellow('deprecated:') + ' %s',
            'Did you mean %s?': 'Unknown command. Did you mean %s?'
        })
        .command([runCommand.command, '$0'], runCommand.describe, runCommand.builder, runCommand.handler)
        .version(packageVersion)
        .help('help')
        .showHelpOnFail(false)
        .wrap(yargsInstance.terminalWidth())
        .strict()
        .fail((msg?: string, err?: Error) => {
            throw msg
                ? // Validation failed example: `Unknown argument:`
                  new Error(msg)
                : // Unknown exception, re-throw.
                  err;
        })
        .parseAsync();
}
