import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { CommandOptions } from '../src/config-models/index.js';
import { InvalidCommandOptionError } from '../src/handlers//exceptions/index.js';
import { getParsedCommandOptions } from '../src/handlers/internals/get-parsed-command-options.js';
import { ParsedCommandOptions } from '../src/handlers/internals/parsed-command-options.js';

void describe('handlers/internals/get-parsed-command-options', () => {
    void describe('getParsedCommandOptions', () => {
        void it('should parse command options without any file args', async () => {
            const cmdOptions: CommandOptions = {
                env: 'prod',
                project: 'a,b , c',
                packageVersion: '1.0.0',
                logLevel: 'info',
                dryRun: true
            };

            const result = await getParsedCommandOptions(cmdOptions);

            const expected: ParsedCommandOptions = {
                ...cmdOptions,
                configPath: null,
                workspaceRoot: process.cwd(),
                outDir: null,
                projects: ['a', 'b', 'c'],
                copy: [],
                style: [],
                script: []
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should parse command options without config file', async () => {
            const cmdOptions: CommandOptions = {
                workspace: './tests/test-data/parsing/withoutconfig',
                outDir: 'out',
                env: 'prod',
                project: 'a,b , c',
                copy: '**/*.js, README.md',
                clean: true,
                style: 'style.scss , style.scss',
                script: 'index.ts, index.ts',
                packageVersion: '1.0.0',
                logLevel: 'info',
                dryRun: true
            };

            const result = await getParsedCommandOptions(cmdOptions);

            const expected: ParsedCommandOptions = {
                ...cmdOptions,
                configPath: null,
                workspaceRoot: path.resolve(process.cwd(), './tests/test-data/parsing/withoutconfig'),
                outDir: path.resolve(process.cwd(), './tests/test-data/parsing/withoutconfig/out'),
                projects: ['a', 'b', 'c'],
                copy: ['**/*.js', 'README.md'],
                style: ['style.scss'],
                script: ['index.ts']
            };

            assert.deepStrictEqual(result, expected);
        });

        void it('should parse command options with config file', async () => {
            const cmdOptions: CommandOptions = {
                workspace: './tests/test-data/parsing/withconfig/libconfig.json',
                outDir: 'out',
                env: 'prod',
                project: 'a,b , c',
                copy: '**/*.js, README.md',
                clean: true,
                style: 'style.scss , style.scss',
                script: 'index.ts, index.ts',
                packageVersion: '1.0.0',
                logLevel: 'info',
                dryRun: true
            };

            const result = await getParsedCommandOptions(cmdOptions);

            const expected: ParsedCommandOptions = {
                ...cmdOptions,
                configPath: path.resolve(process.cwd(), './tests/test-data/parsing/withconfig/libconfig.json'),
                workspaceRoot: path.resolve(process.cwd(), './tests/test-data/parsing/withconfig'),
                outDir: path.resolve(process.cwd(), './tests/test-data/parsing/withconfig/out'),
                projects: ['a', 'b', 'c'],
                copy: ['**/*.js', 'README.md'],
                style: ['style.scss'],
                script: ['index.ts']
            };

            assert.deepStrictEqual(result, expected);
        });

        void it("should throw an error when specified workspace libconfig.json file doesn't not exist", async () => {
            const cmdOptions: CommandOptions = {
                workspace: './tests/test-data/notexist/libconfig.json'
            };

            const expectedError = new InvalidCommandOptionError(
                'workspace',
                cmdOptions.workspace,
                `The workspace config file doesn't exist.`
            );

            await assert.rejects(async () => await getParsedCommandOptions(cmdOptions), expectedError);
        });

        void it("should throw an error when specified workspace directory doesn't not exist", async () => {
            const cmdOptions: CommandOptions = {
                workspace: './tests/test-data/notexist'
            };

            const expectedError = new InvalidCommandOptionError(
                'workspace',
                cmdOptions.workspace,
                `The workspace directory doesn't exist.`
            );

            await assert.rejects(async () => await getParsedCommandOptions(cmdOptions), expectedError);
        });

        void it(
            'should throw an error when specified outDir is system root directory on Windows',
            { skip: process.platform !== 'win32' },
            async () => {
                const cmdOptions: CommandOptions = {
                    outDir: 'C:\\'
                };

                const expectedError = new InvalidCommandOptionError(
                    'outDir',
                    cmdOptions.outDir,
                    `The outDir must not be system root directory.`
                );

                await assert.rejects(async () => await getParsedCommandOptions(cmdOptions), expectedError);
            }
        );

        void it('should throw an error when specified outDir is parent of current working directory', async () => {
            const cmdOptions: CommandOptions = {
                outDir: '../'
            };

            const expectedError = new InvalidCommandOptionError(
                'outDir',
                cmdOptions.outDir,
                `The outDir must not be parent directory of current working directory.`
            );

            await assert.rejects(async () => await getParsedCommandOptions(cmdOptions), expectedError);
        });

        void it("should throw an error when specified copy entry file doesn't not exist", async () => {
            const cmdOptions: CommandOptions = {
                copy: 'not.txt'
            };

            const expectedError = new InvalidCommandOptionError(
                'copy',
                cmdOptions.copy,
                'Could not find the file(s) to copy.'
            );

            await assert.rejects(async () => await getParsedCommandOptions(cmdOptions), expectedError);
        });

        void it("should throw an error when specified style entry file doesn't not exist", async () => {
            const cmdOptions: CommandOptions = {
                style: 'not.css'
            };

            const expectedError = new InvalidCommandOptionError(
                'style',
                cmdOptions.style,
                'Could not find some style file(s) to bundle.'
            );

            await assert.rejects(async () => await getParsedCommandOptions(cmdOptions), expectedError);
        });

        void it('should throw an error when specified style entry is glob pattern', async () => {
            const cmdOptions: CommandOptions = {
                style: '**/*.css'
            };

            const expectedError = new InvalidCommandOptionError(
                'style',
                cmdOptions.style,
                'Could not find some style file(s) to bundle.'
            );

            await assert.rejects(async () => await getParsedCommandOptions(cmdOptions), expectedError);
        });

        void it("should throw an error when specified script entry file doesn't not exist", async () => {
            const cmdOptions: CommandOptions = {
                script: 'not.ts'
            };

            const expectedError = new InvalidCommandOptionError(
                'script',
                cmdOptions.script,
                'Could not find some script file(s) to bundle.'
            );

            await assert.rejects(async () => await getParsedCommandOptions(cmdOptions), expectedError);
        });

        void it('should throw an error when specified script entry is glob pattern', async () => {
            const cmdOptions: CommandOptions = {
                script: '**/*.ts'
            };

            const expectedError = new InvalidCommandOptionError(
                'script',
                cmdOptions.script,
                'Could not find some script file(s) to bundle.'
            );

            await assert.rejects(async () => await getParsedCommandOptions(cmdOptions), expectedError);
        });
    });
});
