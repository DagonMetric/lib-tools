import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { colors } from '../utils/index.js';

import * as runCommand from './commands/run.js';

/**
 * @internal
 */
export interface CliInfo {
    version: string;
}

/**
 * @internal
 */
export default async function (cliInfo: Readonly<CliInfo>): Promise<void> {
    const packageVersion = cliInfo.version;

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
