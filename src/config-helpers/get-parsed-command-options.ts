import { glob } from 'glob';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { CommandOptions } from '../config-models/index.js';
import { ParsedCommandOptions } from '../config-models/parsed/index.js';
import { InvalidCommandOptionError } from '../exceptions/invalid-command-option-error.js';
import { isInFolder, isSamePath, normalizePathToPOSIXStyle, pathExists, resolvePath } from '../utils/index.js';

async function checkPaths(
    globPatternsOrRelativePaths: readonly string[],
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
                const absolutePath = resolvePath(cwd, normalizedPathOrPattern);
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
    if (cmdOptions._configPath) {
        if (!(await pathExists(cmdOptions._configPath))) {
            throw new InvalidCommandOptionError(
                'workspace',
                cmdOptions.workspace,
                `The workspace config file doesn't exist.`
            );
        } else {
            const configFileStats = await fs.stat(cmdOptions._configPath);
            if (!configFileStats.isFile()) {
                throw new InvalidCommandOptionError(
                    'workspace',
                    cmdOptions.workspace,
                    `Config path ${cmdOptions._configPath} must be a file.`
                );
            }
        }
    }

    if (cmdOptions.workspace) {
        if (!(await pathExists(cmdOptions._workspaceRoot))) {
            throw new InvalidCommandOptionError(
                'workspace',
                cmdOptions.workspace,
                `The workspace directory doesn't exist.`
            );
        }
    }

    if (cmdOptions._outDir) {
        const outDir = cmdOptions._outDir;
        if (outDir.trim() === '/' || outDir.trim() === '\\' || isSamePath(outDir, path.parse(outDir).root)) {
            throw new InvalidCommandOptionError(
                'outDir',
                cmdOptions.outDir,
                `The outDir must not be system root directory.`
            );
        }

        if (isInFolder(outDir, process.cwd())) {
            throw new InvalidCommandOptionError(
                'outDir',
                cmdOptions.outDir,
                `The outDir must not be parent directory of current working directory.`
            );
        }

        if (cmdOptions.workspace && isInFolder(outDir, cmdOptions._workspaceRoot)) {
            throw new InvalidCommandOptionError(
                'outDir',
                cmdOptions.outDir,
                `The outDir must not be parent directory of workspace directory.`
            );
        }
    }

    if (cmdOptions._copyEntries.length) {
        if (!(await checkPaths(cmdOptions._copyEntries, cmdOptions._workspaceRoot, true))) {
            throw new InvalidCommandOptionError('copy', cmdOptions.copy, 'Could not find the file(s) to copy.');
        }
    }

    if (cmdOptions._styleEntries.length) {
        if (!(await checkPaths(cmdOptions._styleEntries, cmdOptions._workspaceRoot, false))) {
            throw new InvalidCommandOptionError(
                'style',
                cmdOptions.style,
                'Could not find some style file(s) to bundle.'
            );
        }
    }

    if (cmdOptions._scriptEntries.length) {
        if (!(await checkPaths(cmdOptions._scriptEntries, cmdOptions._workspaceRoot, false))) {
            throw new InvalidCommandOptionError(
                'script',
                cmdOptions.script,
                'Could not find some script file(s) to bundle.'
            );
        }
    }
}

export async function getParsedCommandOptions(cmdOptions: CommandOptions): Promise<ParsedCommandOptions> {
    let workspaceRoot = process.cwd();
    let configPath: string | null = null;
    if (cmdOptions.workspace?.trim().length) {
        const pathAbs = resolvePath(process.cwd(), cmdOptions.workspace);

        if (path.extname(pathAbs) && /\.json$/i.test(pathAbs)) {
            configPath = pathAbs;
            workspaceRoot = path.dirname(configPath);
        } else {
            workspaceRoot = pathAbs;
        }
    }

    const projects =
        cmdOptions.project
            ?.split(',')
            .filter((projectName) => projectName && projectName.trim().length > 0)
            .map((projectName) => projectName.trim())
            .filter((value, index, array) => array.indexOf(value) === index) ?? [];

    // For build task
    //
    const outDir = cmdOptions.outDir?.trim().length ? resolvePath(workspaceRoot, cmdOptions.outDir) : null;

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

        _outDir: outDir,
        _copyEntries: copyEntries,
        _scriptEntries: scriptEntries,
        _styleEntries: styleEntries
    };

    await validateParsedCommandOptions(parsedCommandOptions);

    return parsedCommandOptions;
}
