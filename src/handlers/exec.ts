import { spawn } from 'node:child_process';

import { ExitCodeError } from '../exceptions/index.js';
import { LoggerBase } from '../utils/index.js';

/**
 * @internal
 */
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
