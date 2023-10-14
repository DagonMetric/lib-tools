import { glob } from 'glob';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BuildTaskOptions, CommandOptions } from '../../config-models/index.js';
import { isInFolder, isSamePath, normalizePathToPOSIXStyle, pathExists, resolvePath } from '../../utils/index.js';

import { InvalidCommandOptionError, InvalidConfigError } from '../exceptions/index.js';

function validateOutDir(
    outDir: string | undefined,
    projectInfo: {
        workspaceRoot: string;
        projectRoot: string;
        projectName?: string | null;
        configPath?: string | null;
    }
): void {
    const { workspaceRoot, projectRoot, configPath, projectName } = projectInfo;

    const configLocation = projectName ? `projects/${projectName}/tasks/build/outDir` : null;

    if (!outDir?.trim().length) {
        const errMsg = `The 'outDir' must not be empty.`;
        if (configLocation) {
            throw new InvalidConfigError(errMsg, configPath, configLocation);
        } else {
            throw new InvalidCommandOptionError('outDir', null, errMsg);
        }
    }

    const outDirAbs = resolvePath(projectRoot, outDir);

    if (outDirAbs === '/' || outDirAbs === '\\' || isSamePath(outDir, path.parse(outDir).root)) {
        const errMsg = `The 'outDir' must not be the system root directory.`;
        if (configLocation) {
            throw new InvalidConfigError(errMsg, configPath, configLocation);
        } else {
            throw new InvalidCommandOptionError('outDir', null, errMsg);
        }
    }

    if (isInFolder(outDirAbs, workspaceRoot)) {
        const errMsg = `The 'outDir' must not be the parent of workspace root.`;
        if (configLocation) {
            throw new InvalidConfigError(errMsg, configPath, configLocation);
        } else {
            throw new InvalidCommandOptionError('outDir', null, errMsg);
        }
    }

    if (process.cwd() !== workspaceRoot && isInFolder(outDir, process.cwd())) {
        const errMsg = `The 'outDir' must not be the parent of current working directory.`;
        if (configLocation) {
            throw new InvalidConfigError(errMsg, configPath, configLocation);
        } else {
            throw new InvalidCommandOptionError('outDir', null, errMsg);
        }
    }

    if (projectRoot !== workspaceRoot && isInFolder(outDir, projectRoot)) {
        throw new InvalidConfigError(
            `The 'outDir' must not be the parent of project root directory.`,
            configPath,
            configLocation
        );
    }
}

async function validateInputPaths(
    globPatternsOrPaths: readonly string[],
    options: Readonly<{
        rootDir: string;
        acceptGlobMagic: boolean;
        acceptDir: boolean;
        argName?: keyof CommandOptions;
        configPath?: string | null;
        configLocation?: string | null;
    }>
): Promise<void> {
    const { rootDir, configPath, argName, acceptDir, configLocation } = options;

    for (let i = 0; i < globPatternsOrPaths.length; i++) {
        const pathOrPattern = globPatternsOrPaths[i];

        let normalizedPathOrPattern = normalizePathToPOSIXStyle(pathOrPattern);

        if (!normalizedPathOrPattern && /^[./\\]/.test(pathOrPattern)) {
            normalizedPathOrPattern = './';
        }

        if (!normalizedPathOrPattern) {
            const errMsg = 'Empty path found.';
            if (argName) {
                throw new InvalidCommandOptionError(argName, pathOrPattern, errMsg);
            } else {
                throw new InvalidConfigError(errMsg, configPath, configLocation?.replace('[i]', `${i}`));
            }
        }

        if (glob.hasMagic(normalizedPathOrPattern)) {
            if (!options.acceptGlobMagic) {
                const errMsg = 'Invalid file path.';
                if (argName) {
                    throw new InvalidCommandOptionError(argName, pathOrPattern, errMsg);
                } else {
                    throw new InvalidConfigError(errMsg, configPath, configLocation?.replace('[i]', `${i}`));
                }
            }

            continue;
        } else {
            // We allow absolute path on Windows only.
            const absolutePath = resolvePath(rootDir, normalizedPathOrPattern);
            if (!(await pathExists(absolutePath, true))) {
                const errMsg = 'Path not found.';
                if (argName) {
                    throw new InvalidCommandOptionError(argName, pathOrPattern, errMsg);
                } else {
                    throw new InvalidConfigError(errMsg, configPath, configLocation?.replace('[i]', `${i}`));
                }
            }

            const stats = await fs.stat(absolutePath);

            if (!acceptDir && !stats.isFile()) {
                const errMsg = 'Path must be a file path.';
                if (argName) {
                    throw new InvalidCommandOptionError(argName, pathOrPattern, errMsg);
                } else {
                    throw new InvalidConfigError(errMsg, configPath, configLocation?.replace('[i]', `${i}`));
                }
            }
        }
    }
}

/**
 * @internal
 */
export async function validateBuildTask(
    buildTask: Readonly<BuildTaskOptions>,
    projectInfo: Readonly<{
        workspaceRoot: string;
        projectRoot: string;
        projectName?: string | null;
        configPath?: string | null;
    }>
): Promise<void> {
    const { projectRoot, configPath, projectName } = projectInfo;
    const configLocationPrefix = projectName ? `projects/${projectName}/tasks/build` : `tasks/build`;

    validateOutDir(buildTask.outDir, projectInfo);

    if (buildTask.copy) {
        const paths = buildTask.copy.map((entry) => {
            if (typeof entry === 'string') {
                return entry;
            } else {
                return entry.from;
            }
        });

        await validateInputPaths(paths, {
            rootDir: projectRoot,
            acceptGlobMagic: true,
            acceptDir: true,
            configPath,
            configLocation: `${configLocationPrefix}/copy/[i]`
        });
    }

    if (buildTask.style) {
        if (Array.isArray(buildTask.style)) {
            await validateInputPaths(buildTask.style, {
                rootDir: projectRoot,
                acceptGlobMagic: false,
                acceptDir: false,
                configPath,
                configLocation: `${configLocationPrefix}/style/[i]`
            });
        } else {
            const entryPaths = buildTask.style.compilations
                .filter((compilation) => compilation.entry)
                .map((compilation) => {
                    return compilation.entry;
                });

            await validateInputPaths(entryPaths, {
                rootDir: projectRoot,
                acceptGlobMagic: false,
                acceptDir: false,
                configPath,
                configLocation: `${configLocationPrefix}/style/compilations/[i]/entry`
            });

            // TODO: findUp?
            // if (buildTask.style.includePaths) {
            //     await validateInputPaths(buildTask.style.includePaths, {
            //         rootDir: projectRoot,
            //         acceptGlobMagic: false,
            //         acceptDir: true,
            //         configPath,
            //         configLocation: `${configLocationPrefix}/style/includePaths/[i]`
            //     });
            // }
        }
    }

    if (buildTask.script) {
        if (Array.isArray(buildTask.script)) {
            await validateInputPaths(buildTask.script, {
                rootDir: projectRoot,
                acceptGlobMagic: false,
                acceptDir: false,
                configPath,
                configLocation: `${configLocationPrefix}/script/[i]`
            });
        } else {
            if (buildTask.script.compilations && Array.isArray(buildTask.script.compilations)) {
                const entryPaths = buildTask.script.compilations
                    .filter((compilation) => compilation.entry)
                    .map((compilation) => {
                        return compilation.entry!;
                    });

                await validateInputPaths(entryPaths, {
                    rootDir: projectRoot,
                    acceptGlobMagic: false,
                    acceptDir: false,
                    configPath,
                    configLocation: `${configLocationPrefix}/script/compilations/[i]/entry`
                });

                const tsconfigPaths = buildTask.script.compilations
                    .filter((compilation) => compilation.tsconfig)
                    .map((compilation) => {
                        return compilation.tsconfig!;
                    });

                await validateInputPaths(tsconfigPaths, {
                    rootDir: projectRoot,
                    acceptGlobMagic: false,
                    acceptDir: false,
                    configPath,
                    configLocation: `${configLocationPrefix}/script/compilations/[i]/tsconfig`
                });
            }

            if (buildTask.script.tsconfig) {
                await validateInputPaths([buildTask.script.tsconfig], {
                    rootDir: projectRoot,
                    acceptGlobMagic: false,
                    acceptDir: false,
                    configPath,
                    configLocation: `${configLocationPrefix}/script/tsconfig`
                });
            }
        }
    }
}
