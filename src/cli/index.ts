import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { colors } from '../utils/index.js';

import { CliInfo } from './cli-info.js';

import * as buildCommand from './commands/build.js';

const commands = [buildCommand];

export default async function (cliInfo: CliInfo): Promise<void> {
    const yargsInstance = yargs(hideBin(process.argv));
    await yargsInstance
        .scriptName('lib')
        // https://github.com/yargs/yargs/blob/main/docs/advanced.md#customizing-yargs-parser
        .parserConfiguration({
            'populate--': true,
            'unknown-options-as-args': false,
            'dot-notation': false,
            'boolean-negation': true,
            'strip-aliased': true,
            'strip-dashed': true,
            'camel-case-expansion': false
        })
        // .usage(`${cliInfo.packageName} v${cliInfo.version}\n\nUsage:\nlib [command] [options...]`)
        .usage('$0 [command] [options...]')
        .example([
            ['$0 build', 'Build the project(s)'],
            ['$0 --help', 'Show help'],
            ['$0 --version', 'Show version']
        ])
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
        .command(commands)
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
