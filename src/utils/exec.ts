import { spawn } from 'node:child_process';

export async function exec(cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, { stdio: 'inherit', shell: true });

        proc.on('exit', (exitCode) => {
            if (exitCode === 0) {
                resolve();
            } else {
                reject(new Error(`Process exited with code: ${exitCode}`));
            }
        });
        proc.on('error', (error) => {
            reject(error);
        });
    });
}
