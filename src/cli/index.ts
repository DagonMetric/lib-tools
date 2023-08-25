import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { colors } from '../utils/index.js';

import { CliInfo } from './cli-info.js';

import * as runCommand from './commands/run.js';

export default async function (cliInfo: CliInfo): Promise<void> {
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
        // .usage('$0 <task> [options...]')
        // .example([
        //     ['$0 build', 'Run build task(s)'],
        //     ['$0 --help', 'Show help'],
        //     ['$0 --version', 'Show version']
        // ])
        // A complete list of strings can be found: https://github.com/yargs/yargs/blob/main/locales/en.json
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
        .version(cliInfo.version)
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
