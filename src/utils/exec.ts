import { spawn } from 'node:child_process';

import { Logger } from './logger.js';

export class ExitCodeError extends Error {
    constructor(readonly exitCode: number) {
        super('');
    }
}

export async function exec(cmd: string, logger: Logger): Promise<void> {
    return new Promise((resolve, reject) => {
        // const proc = spawn(cmd, { stdio: 'inherit', shell: true });
        const proc = spawn(cmd, { shell: true });

        proc.stdout?.on('data', (data) => {
            logger.info(`${(data as string)?.toString().trimEnd()}`);
        });

        proc.stderr?.on('data', (data) => {
            logger.error(`${(data as string)?.toString().trimEnd()}`);
        });

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
