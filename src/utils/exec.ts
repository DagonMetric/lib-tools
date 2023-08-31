import { spawn } from 'node:child_process';

export class ExitCodeError extends Error {
    constructor(readonly exitCode: number) {
        super('');
    }
}

export async function exec(cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, { stdio: 'inherit', shell: true });

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
