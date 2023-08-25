import * as path from 'node:path';

import { CommandOptions } from '../models/index.js';

export interface ParsedCommandOptions extends CommandOptions {
    readonly _projects: string[];
    readonly _workspaceRoot: string | null;
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
    readonly _workspaceRoot: string | null;
    readonly _configPath: string | null;

    // For build
    readonly _env: Record<string, boolean>;
    readonly _outputPath: string | null;
    readonly _copyEntries: string[];
    readonly _styleEntries: string[];
    readonly _scriptEntries: string[];

    constructor(cmdOptions: CommandOptions) {
        Object.assign(this, cmdOptions);

        this._projects =
            cmdOptions.project
                ?.split(',')
                .filter((projectName) => projectName && projectName.trim().length > 0)
                .filter((value, index, array) => array.indexOf(value) === index) ?? [];

        if (cmdOptions.workspace) {
            const pathAbs = path.isAbsolute(cmdOptions.workspace)
                ? path.resolve(cmdOptions.workspace)
                : path.resolve(process.cwd(), cmdOptions.workspace);

            if (path.extname(pathAbs)) {
                this._configPath = pathAbs;
                this._workspaceRoot = path.dirname(this._configPath);
            } else {
                this._configPath = null;
                this._workspaceRoot = pathAbs;
            }
        } else {
            this._configPath = null;
            this._workspaceRoot = null;
        }

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

        const workspaceRoot = this._workspaceRoot ?? process.cwd();

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
