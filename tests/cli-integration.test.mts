import * as assert from 'node:assert';
import { exec } from 'node:child_process';

import * as path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import packageJson from '../package.json' assert { type: 'json' };

const execAsync = promisify(exec);

const version = packageJson.version;
const libCli = packageJson.bin.lib;

const runCli = async (args: string) => {
    try {
        const { stderr, stdout } = await execAsync(
            `node --no-warnings --enable-source-maps --loader ts-node/esm ${libCli} ${args}`
        );

        return stderr ? stderr.toString().trim() : stdout.toString().trim();
    } catch (err) {
        // Line 1: Command failed: node --no-warnings ./dist/bin/lib.mjs build
        const errLines = (err as Error).message.split('\n');
        return errLines.length > 1 ? errLines.slice(1).join(' ').trim() : errLines.join('\n').trim();
    }
};

void describe('cli-integration', () => {
    // beforeEach(async () => {
    //     const cliExists = await fs
    //         .access(path.resolve(process.cwd(), libCli))
    //         .then(() => true)
    //         .catch(() => false);

    //     if (!cliExists) {
    //         await new Promise((resolve, reject) => {
    //             const proc = spawn('npm run build', { stdio: 'inherit', shell: true });
    //             proc.on('exit', (exitCode) => {
    //                 resolve(exitCode);
    //             });
    //             proc.on('error', (error) => {
    //                 reject(error);
    //             });
    //         });
    //     }
    // });

    void describe('lib --help', () => {
        void it(`should show help if '--help' option is passed`, async () => {
            const result = await runCli('--help');
            const expected = 'lib <task> \\[options\\.\\.\\]';
            assert.match(result, new RegExp(expected), `Should contains '${expected}'`);
        });
    });

    void describe('lib --version', () => {
        void it(`should show version if '--version' option is passed`, async () => {
            const result = await runCli('--version');
            assert.strictEqual(result, version);
        });
    });

    void describe('lib run <task>', { skip: true }, () => {
        void describe('invalid config schema', () => {
            const workspace = './tests/test-data/invalid/libconfig-invalid.json';

            void it('should show schema validation error when invalid schema in config file', async () => {
                const result = await runCli(`run build --workspace=${workspace}`);
                const actualLines = result
                    .split(/[\n\r]/)
                    .filter((l) => l.trim().length)
                    .map((l) => l.trim());

                const expectedLine1 = `${path.resolve(
                    process.cwd(),
                    './tests/test-data/invalid/libconfig-invalid.json'
                )} - Configuration validation errors:`;
                const expectedLine2 =
                    'config location: /projects/invalid-project/tasks/build/script - must be array or object.';
                const expectedLine3 =
                    'See more about libconfig.json configuration at https://github.com/DagonMetric/lib-tools/wiki/Lib-Tools-Workspace-Configuration.';

                assert.strictEqual(actualLines.length, 3);
                assert.strictEqual(actualLines[0], expectedLine1);
                assert.strictEqual(actualLines[1], expectedLine2);
                assert.strictEqual(actualLines[2], expectedLine3);
            });
        });

        void describe('custom handlers', () => {
            const workspace = './tests/test-data/custom-task/libconfig.json';

            void it(`should show 'Hello!' message when run hello task`, async () => {
                const result = await runCli(`run hello --workspace=${workspace}`);

                assert.match(result, /Hello hello/);
            });

            void it(`should show 'Hello exec!' message when run echo task`, async () => {
                const result = await runCli(`run echo --workspace=${workspace}`);

                assert.match(result, /Hello exec!/);
            });
        });

        void describe('build', () => {
            void describe('style', () => {
                const workspace = './tests/test-data/style';

                void it(`should bundle css files [dryRun]`, async () => {
                    const result = await runCli(`run build --workspace=${workspace} --project=css --dryRun`);

                    assert.match(result, /path-1\/bundle\.css/, `should contains 'path-1/bundle.css'`);
                    assert.match(result, /path-1\/bundle\.min\.css/, `should contains 'path-1/bundle.min.css'`);
                    assert.match(result, /path-1\/bundle\.css\.map/, `should contains 'path-1/bundle.css.map'`);
                    assert.match(result, /Total\s3\sfiles\sare\sbuilt/, `Should contains ''Total 3 files are built'`);
                    assert.match(result, /style\s+\[\d+\sms\]/, `Should contains 'style [.... ms]'`);
                    assert.match(result, /css\/build\s+completed/, `Should contains 'css/build completed'`);
                });

                void it(`should bundle css files [Actual Emit]`, async () => {
                    const result = await runCli(`run build --workspace=${workspace} --project=css`);

                    assert.match(result, /path-1\/bundle\.css/, `should contains 'path-1/bundle.css'`);
                    assert.match(result, /path-1\/bundle\.min\.css/, `should contains 'path-1/bundle.min.css'`);
                    assert.match(result, /path-1\/bundle\.css\.map/, `should contains 'path-1/bundle.css.map'`);
                    assert.match(
                        result,
                        /Total\s3\sfiles\sare\semitted/,
                        `Should contains ''Total 3 files are emitted'`
                    );
                    assert.match(result, /style\s+\[\d+\sms\]/, `Should contains 'style [.... ms]'`);
                    assert.match(result, /css\/build\s+completed/, `Should contains 'css/build completed'`);
                });

                void it(`should bundle scss files [dryRun]`, async () => {
                    const result = await runCli(`run build --workspace=${workspace} --project=scss --dryRun`);

                    assert.match(result, /style\.css/, `should contains 'style.css'`);
                    assert.match(result, /Total\s1\sfile\sis\sbuilt/, `Should contains ''Total 1 file is built'`);
                    assert.match(result, /style\s+\[\d+\sms\]/, `Should contains 'style [.... ms]'`);
                    assert.match(result, /scss\/build\s+completed/, `Should contains 'scss/build completed'`);
                });

                void it(`should bundle less files [dryRun]`, async () => {
                    const result = await runCli(`run build --workspace=${workspace} --project=less --dryRun`);

                    assert.match(result, /style\.css/, `should contains 'style.css'`);
                    assert.match(result, /Total\s1\sfile\sis\sbuilt/, `Should contains ''Total 1 file is built'`);
                    assert.match(result, /style\s+\[\d+\sms\]/, `Should contains 'style [.... ms]'`);
                    assert.match(result, /less\/build\s+completed/, `Should contains 'less/build completed'`);
                });
            });
        });
    });
});
