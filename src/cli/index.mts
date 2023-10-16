/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { colors } from '../utils/index.mjs';

import * as runCommand from './commands/run.mjs';

export interface CliInfo {
    cliName: string;
    cliVersion: string;
}

export default async function (cliInfo: Readonly<CliInfo>): Promise<void> {
    if (!cliInfo?.cliName || !cliInfo.cliVersion) {
        throw new Error(`Valid 'cliInfo' options argument is required.`);
    }

    const { cliName, cliVersion } = cliInfo;

    try {
        process.title = `${cliName} v${cliVersion}`;
    } catch (_) {
        process.title = `${cliName}`;
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
        .version(cliVersion)
        .help('help')
        .showHelpOnFail(false)
        .wrap(yargsInstance.terminalWidth())
        .strict()
        .fail((msg?: string, err?: Error) => {
            if (msg) {
                // Validation failed example: `Unknown argument:`
                const errMsg = msg;
                const errPrefix = 'error:';
                if (errMsg.toLowerCase().startsWith(errPrefix)) {
                    errMsg.substring(errPrefix.length).trim();
                }

                // eslint-disable-next-line no-console
                console.error(`${colors.lightRed('Error:')} ${errMsg}`);
                // Exit or re-throw
                process.exit(1);
            } else {
                let errMsg: string | undefined;
                if (typeof err !== 'object' || err === null) {
                    errMsg = String(err);
                } else if (typeof err.message === 'string') {
                    errMsg = err.message;
                } else if (typeof err.stack === 'string') {
                    errMsg = err.stack;
                }

                // eslint-disable-next-line no-console
                console.error(errMsg ? errMsg : err);
                // Exit or re-throw
                process.exit(process.exitCode ?? 1);
            }
        })
        .parseAsync();
}
