/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import { spawn } from 'node:child_process';

import { LoggerBase } from '../../utils/index.mjs';

import { ExitCodeError } from '../exceptions/index.mjs';

export async function exec(cmd: string, logger?: LoggerBase, env?: Record<string, string | undefined>): Promise<void> {
    return new Promise((resolve, reject) => {
        // const proc = spawn(cmd, { stdio: 'inherit', shell: true });
        const proc = spawn(cmd, { shell: true, env });

        if (logger) {
            proc.stdout?.on('data', (data) => {
                logger.info(`${(data as string)?.toString().trimEnd()}`);
            });

            proc.stderr?.on('data', (data) => {
                logger.error(`${(data as string)?.toString().trimEnd()}`);
            });
        }

        proc.on('exit', (exitCode) => {
            if (!exitCode || exitCode === 0) {
                resolve();
                return;
            } else {
                reject(new ExitCodeError(exitCode));
            }
        });
        proc.on('error', (error) => {
            reject(error);
        });
    });
}
