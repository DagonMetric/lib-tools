import { glob } from 'glob';

import * as path from 'node:path';

import { CommandOptions } from '../config-models/index.js';
import { ParsedCommandOptions } from '../config-models/parsed/index.js';
import { InvalidCommandOptionError } from '../exceptions/invalid-command-option-error.js';
import {
    isInFolder,
    isSamePaths,
    isWindowsStyleAbsolute,
    normalizePathToPOSIXStyle,
    pathExists
} from '../utils/index.js';

async function checkPaths(
    globPatternsOrRelativePaths: string[],
    cwd: string,
    acceptGlobMagic: boolean
): Promise<boolean> {
    try {
        for (const pathOrPattern of globPatternsOrRelativePaths) {
            let normalizedPathOrPattern = normalizePathToPOSIXStyle(pathOrPattern);

            if (!normalizedPathOrPattern && /^[./\\]/.test(pathOrPattern)) {
                normalizedPathOrPattern = './';
            }

            if (!normalizedPathOrPattern) {
                continue;
            }

            if (glob.hasMagic(normalizedPathOrPattern)) {
                if (!acceptGlobMagic) {
                    return false;
                }
                continue;
            } else {
                // We allow absolute path on Windows only.
                const absolutePath =
                    isWindowsStyleAbsolute(normalizedPathOrPattern) && process.platform === 'win32'
                        ? path.resolve(normalizePathToPOSIXStyle(normalizedPathOrPattern))
                        : path.resolve(cwd, normalizePathToPOSIXStyle(normalizedPathOrPattern));

                if (!(await pathExists(absolutePath))) {
                    return false;
                }
            }
        }

        return true;
    } catch (err) {
        return false;
    }
}

async function validateParsedCommandOptions(cmdOptions: ParsedCommandOptions): Promise<void> {
    if (cmdOptions._configPath && !(await pathExists(cmdOptions._configPath))) {
        throw new InvalidCommandOptionError(
            `The workspace config file doesn't exist.`,
            `workspace=${cmdOptions.workspace}`
        );
    }

    if (cmdOptions._workspaceRoot) {
        if (!(await pathExists(cmdOptions._workspaceRoot))) {
            throw new InvalidCommandOptionError(
                `The workspace directory doesn't exist.`,
                `workspace=${cmdOptions.workspace}`
            );
        }
    }

    if (cmdOptions._outDir) {
        const outDir = cmdOptions._outDir;
        if (outDir.trim() === '/' || outDir.trim() === '\\' || isSamePaths(outDir, path.parse(outDir).root)) {
            throw new InvalidCommandOptionError(
                `The outDir must not be system root directory.`,
                `outDir=${cmdOptions.outDir}`
            );
        }

        if (
            isInFolder(outDir, process.cwd()) ||
            (cmdOptions._workspaceRoot && isInFolder(outDir, cmdOptions._workspaceRoot))
        ) {
            throw new InvalidCommandOptionError(
                `The outDir must not be parent directory of current working directory.`,
                `outDir=${cmdOptions.outDir}`
            );
        }
    }

    const cwd = cmdOptions._workspaceRoot ?? process.cwd();

    if (cmdOptions._copyEntries.length) {
        if (!(await checkPaths(cmdOptions._copyEntries, cwd, true))) {
            throw new InvalidCommandOptionError('Could not find the file(s) to copy.', `copy=${cmdOptions.copy}`);
        }
    }

    if (cmdOptions._styleEntries.length) {
        if (!(await checkPaths(cmdOptions._styleEntries, cwd, false))) {
            throw new InvalidCommandOptionError(
                'Could not find some style file(s) to bundle.',
                `style=${cmdOptions.style}`
            );
        }
    }

    if (cmdOptions._scriptEntries.length) {
        if (!(await checkPaths(cmdOptions._scriptEntries, cwd, false))) {
            throw new InvalidCommandOptionError(
                'Could not find some script file(s) to bundle.',
                `script=${cmdOptions.script}`
            );
        }
    }
}

export async function getParsedCommandOptions(cmdOptions: CommandOptions): Promise<ParsedCommandOptions> {
    let workspaceRoot: string | null = null;
    let configPath: string | null = null;

    const projects =
        cmdOptions.project
            ?.split(',')
            .filter((projectName) => projectName && projectName.trim().length > 0)
            .map((projectName) => projectName.trim())
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    if (cmdOptions.workspace?.trim().length) {
        const pathAbs =
            isWindowsStyleAbsolute(cmdOptions.workspace) && process.platform === 'win32'
                ? path.resolve(normalizePathToPOSIXStyle(cmdOptions.workspace))
                : path.resolve(process.cwd(), normalizePathToPOSIXStyle(cmdOptions.workspace));

        if (path.extname(pathAbs) && /\.json$/i.test(pathAbs)) {
            configPath = pathAbs;
            workspaceRoot = path.dirname(configPath);
        } else {
            workspaceRoot = pathAbs;
        }
    }

    const env =
        cmdOptions.env
            ?.split(',')
            .filter((envName) => envName && envName.trim().length > 0)
            .map((envName) => envName.trim())
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

    const outDir = cmdOptions.outDir?.trim().length
        ? isWindowsStyleAbsolute(cmdOptions.outDir) && process.platform === 'win32'
            ? path.resolve(normalizePathToPOSIXStyle(cmdOptions.outDir))
            : path.resolve(workspaceRoot ?? process.cwd(), normalizePathToPOSIXStyle(cmdOptions.outDir))
        : null;

    const copyEntries =
        cmdOptions.copy
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .map((p) => p.trim())
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const styleEntries =
        cmdOptions.style
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .map((p) => p.trim())
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const scriptEntries =
        cmdOptions.script
            ?.split(',')
            .filter((p) => p && p.trim().length > 0)
            .map((p) => p.trim())
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    const parsedCommandOptions: ParsedCommandOptions = {
        ...cmdOptions,
        _projects: projects,
        _workspaceRoot: workspaceRoot,
        _configPath: configPath,
        _env: env,
        _outDir: outDir,
        _copyEntries: copyEntries,
        _scriptEntries: scriptEntries,
        _styleEntries: styleEntries
    };

    await validateParsedCommandOptions(parsedCommandOptions);

    return parsedCommandOptions;
}
