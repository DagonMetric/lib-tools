import path from 'node:path';
import { fileURLToPath } from 'node:url';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { colors, findUp, readJsonWithComments } from '../utils/index.js';

import * as runCommand from './commands/run.js';

const thisPackageName = 'lib-tools';

/**
 * @internal
 */
export interface CliInfo {
    version?: string;
}

/**
 * @internal
 */
export default async function (cliInfo?: Readonly<CliInfo>): Promise<void> {
    let packageVersion = cliInfo?.version && typeof cliInfo.version === 'string' ? cliInfo.version : null;

    if (!packageVersion) {
        const thisDir = path.dirname(fileURLToPath(import.meta.url));

        const packageJsonPath = await findUp(
            'package.json',
            path.resolve(thisDir, './'),
            path.resolve(thisDir, '../../'),
            true
        );

        if (!packageJsonPath) {
            throw new Error('Could not find package.json file.');
        }

        const { name, version } = (await readJsonWithComments(packageJsonPath)) as { name: string; version: string };

        if (!name || !version || name !== thisPackageName) {
            throw new Error('Could not find package.json file.');
        }

        packageVersion = version;
    }

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
            'Commands:': colors.lightCyan('Commands:'),
            'Options:': colors.lightCyan('Options:'),
            'Positionals:': colors.lightCyan('Arguments:'),
            'Examples:': colors.lightCyan('Examples:'),
            deprecated: colors.lightYellow('deprecated'),
            'deprecated: %s': colors.lightYellow('deprecated:') + ' %s',
            'Did you mean %s?': 'Unknown command. Did you mean %s?'
        })
        .command([runCommand.command, '$0'], runCommand.describe, runCommand.builder, runCommand.handler)
        .version(packageVersion)
        .help('help')
        .showHelpOnFail(false)
        .wrap(yargsInstance.terminalWidth())
        .strict()
        .fail((msg?: string, err?: Error) => {
            // TODO: To review
            throw msg
                ? // Validation failed example: `Unknown argument:`
                  new Error(msg)
                : // Unknown exception, re-throw.
                  err;
        })
        .parseAsync();
}
