import * as path from 'node:path';

import { BuildCommandOptions, CommandOptions } from '../models/index.js';

export interface ParsedCommandOptions extends BuildCommandOptions {
    readonly _projects: string[];
    readonly _configPath: string | null;

    // For build
    readonly _env: Record<string, boolean>;
    readonly _outputPath: string | null;
    readonly _copyEntries: string[];
    readonly _styleEntries: string[];
    readonly _scriptEntries: string[];
}

export class ParsedCommandOptionsImpl implements ParsedCommandOptions {
    readonly _projects: string[];
    readonly _configPath: string | null;

    // For build
    readonly _env: Record<string, boolean>;
    readonly _outputPath: string | null;
    readonly _copyEntries: string[];
    readonly _styleEntries: string[];
    readonly _scriptEntries: string[];

    constructor(cmdOptions: BuildCommandOptions) {
        Object.assign(this, cmdOptions);

        this._projects =
            cmdOptions.project
                ?.split(',')
                .filter((projectName) => projectName && projectName.trim().length > 0)
                .filter((value, index, array) => array.indexOf(value) === index) ?? [];

        const configPath = cmdOptions.libconfig
            ? path.isAbsolute(cmdOptions.libconfig)
                ? cmdOptions.libconfig
                : path.resolve(process.cwd(), cmdOptions.libconfig)
            : null;
        this._configPath = configPath;

        this._env =
            cmdOptions.env
                ?.split(',')
                .filter((envName) => envName && envName.trim().length > 0)
                .filter((value, index, array) => array.indexOf(value) === index)
                .reduce(
                    (obj, key) => {
                        return {
                            ...obj,
                            [key]: true
                        };
                    },
                    {} as Record<string, boolean>
                ) ?? {};

        const workspaceRoot = configPath
            ? path.extname(configPath)
                ? path.dirname(configPath)
                : configPath
            : process.cwd();

        this._outputPath = cmdOptions.outputPath
            ? path.isAbsolute(cmdOptions.outputPath)
                ? path.resolve(cmdOptions.outputPath)
                : path.resolve(workspaceRoot, cmdOptions.outputPath)
            : null;

        this._copyEntries =
            cmdOptions.copy
                ?.split(',')
                .filter((p) => p && p.trim().length > 0)
                .filter((value, index, array) => array.indexOf(value) === index) ?? [];

        this._styleEntries =
            cmdOptions.style
                ?.split(',')
                .filter((p) => p && p.trim().length > 0)
                .filter((value, index, array) => array.indexOf(value) === index) ?? [];

        this._scriptEntries =
            cmdOptions.script
                ?.split(',')
                .filter((p) => p && p.trim().length > 0)
                .filter((value, index, array) => array.indexOf(value) === index) ?? [];
    }
}

export function getParsedCommandOptions(cmdOptions: CommandOptions): ParsedCommandOptions {
    return new ParsedCommandOptionsImpl(cmdOptions);
}
