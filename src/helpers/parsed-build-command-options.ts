import * as path from 'node:path';

import { BuildCommandOptions } from '../models/index.js';

export interface ParsedBuildCommandOptions extends BuildCommandOptions {
    readonly _env: Record<string, boolean>;
    readonly _projects: string[];
    readonly _configPath: string | null;
    readonly _outputPath: string | null;
    readonly _copyEntries: string[];
    readonly _styleEntries: string[];
    readonly _scriptEntries: string[];
}

export class ParsedBuildCommandOptionsImpl implements ParsedBuildCommandOptions {
    readonly _env: Record<string, boolean>;
    readonly _projects: string[];
    readonly _configPath: string | null;
    readonly _outputPath: string | null;
    readonly _copyEntries: string[];
    readonly _styleEntries: string[];
    readonly _scriptEntries: string[];

    constructor(cmdOptions: BuildCommandOptions) {
        Object.assign(this, cmdOptions);

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

export function getParsedBuildCommandOptions(cmdOptions: BuildCommandOptions): ParsedBuildCommandOptions {
    return new ParsedBuildCommandOptionsImpl(cmdOptions);
}
