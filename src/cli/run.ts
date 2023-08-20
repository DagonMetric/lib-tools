import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { colors } from '../utils/index.js';

import { CliInfo } from './cli-info.js';

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
        .usage(colors.white(`${cliInfo.packageName} v${cliInfo.version}\nUsage:\nlib [command] [options...]`))
        .example('lib build', 'Build the project(s) using libconfig.json configuration file.')
        .example('lib build --libconfig=auto', 'Analyze project structure and build automatically.')
        .example('lib --help', 'Show help')
        // A complete list of strings can be found: https://github.com/yargs/yargs/blob/main/locales/en.json
        .updateStrings({
            'Commands:': colors.cyan('Commands:'),
            'Options:': colors.cyan('Options:'),
            'Positionals:': colors.cyan('Arguments:'),
            deprecated: colors.yellow('deprecated'),
            'deprecated: %s': colors.yellow('deprecated:') + ' %s',
            'Did you mean %s?': 'Unknown command. Did you mean %s?'
        })
        .demandCommand(
            1,
            `You need to specify a command before moving on. Use '--help' to view the available commands.`
        )
        .recommendCommands()
        .version(false)
        .help('help', 'Shows a help message for this command in the console.')
        .showHelpOnFail(false)
        .wrap(yargsInstance.terminalWidth())
        .strict()
        .fail((msg, err) => {
            throw msg
                ? // Validation failed example: `Unknown argument:`
                  new Error(msg)
                : // Unknown exception, re-throw.
                  err;
        })
        .parseAsync();
}
