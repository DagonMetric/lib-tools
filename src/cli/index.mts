/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { Logger, colors } from '../public-api.mjs';

import * as runCommand from './commands/run.mjs';

export interface CliInfo {
    cliName: string;
    cliVersion: string;
}

export default async function (cliInfo?: Readonly<CliInfo>): Promise<void> {
    const logger = new Logger();

    let cliName: string;
    let cliVersion: string;

    if (!cliInfo?.cliName || !cliInfo.cliVersion) {
        const thisDir = path.dirname(fileURLToPath(import.meta.url));
        let packageJsonPath: string | undefined;

        try {
            // TODO: experimental
            // import.meta.resolve(...);
            const thisDirRequire = createRequire(thisDir + '/');
            packageJsonPath = thisDirRequire.resolve('lib-tools/package.json');
        } catch (_) {}

        if (!packageJsonPath) {
            logger.error(`${colors.lightRed('Error:')} Could not load lib-tools/package.json file.`);
            // Exit or re-throw
            process.exit(1);
        }

        const content = await fs.readFile(packageJsonPath, { encoding: 'utf-8' });
        const { name, verstion } = JSON.parse(content) as { name: string; verstion: string };
        cliName = name;
        cliVersion = verstion;
    } else {
        cliName = cliInfo.cliName;
        cliVersion = cliInfo.cliVersion;
    }

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
                const errMsg = msg;
                const errPrefix = 'error:';
                if (errMsg.toLowerCase().startsWith(errPrefix)) {
                    errMsg.substring(errPrefix.length).trim();
                }

                logger.error(`${colors.lightRed('Error:')} ${errMsg}`);
                // Exit or re-throw
                process.exit(1);
            } else {
                let errMsg: string | undefined;
                const unknownErrorPrefix = colors.lightRed('Unknown error occours.');

                if (!err) {
                    errMsg = unknownErrorPrefix;
                } else if (typeof err.message === 'string') {
                    errMsg = err.message;
                } else if (typeof err.stack === 'string') {
                    errMsg = unknownErrorPrefix + '\n' + err.stack;
                } else if (typeof err !== 'object') {
                    errMsg = unknownErrorPrefix + '\n' + +String(err);
                } else {
                    // errMsg = unknownErrorPrefix + '\n' + util.format('%o', err);
                    errMsg = unknownErrorPrefix + '\n' + +JSON.stringify(err, null, 2);
                }

                logger.error(errMsg);
                // Exit or re-throw
                process.exit(process.exitCode ?? 1);
            }
        })
        .parseAsync();
}
