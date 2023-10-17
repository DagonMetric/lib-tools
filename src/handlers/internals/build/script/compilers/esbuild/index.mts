/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import * as esbuild from 'esbuild';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
    LoggerBase,
    colors,
    formatSizeInBytes,
    isSamePath,
    normalizePathToPOSIXStyle,
    pathExists
} from '../../../../../../utils/index.mjs';

import { CompilationError } from '../../../../../exceptions/index.mjs';

import { CompileAsset, CompileOptions, CompileResult } from '../interfaces.mjs';

function getEsBuildTargets(options: CompileOptions): string[] {
    const targets: string[] = [];
    if (options.scriptTarget) {
        targets.push(options.scriptTarget.toLowerCase());
    }

    // See - https://esbuild.github.io/api/#target for supported targets
    //
    // chrome
    // deno
    // edge
    // firefox
    // hermes
    // ie
    // ios
    // node
    // opera
    // rhino
    // safari

    if (options.environmentTargets) {
        for (const target of options.environmentTargets) {
            if (target === 'web' || target === 'node' || targets.includes(target)) {
                continue;
            }

            targets.push(target);
        }
    }

    return targets;
}

function getEsBuildPlatform(options: CompileOptions): esbuild.Platform | undefined {
    if (
        options.moduleFormat === 'cjs' ||
        (options.outFilePath != null && path.extname(options.outFilePath).toLowerCase() === '.cjs') ||
        options.environmentTargets?.some(
            (t) => t === 'node' || t === 'deno' || t.startsWith('node') || t.startsWith('deno')
        )
    ) {
        return 'node';
    } else if (
        options.moduleFormat === 'iife' ||
        options.environmentTargets?.some(
            (t) =>
                t === 'web' ||
                t.startsWith('chrome') ||
                t.startsWith('edge') ||
                t.startsWith('firefox') ||
                t.startsWith('ie') ||
                t.startsWith('opera') ||
                t.startsWith('safari') ||
                t.startsWith('ios') ||
                t.startsWith('hermes') ||
                t.startsWith('rhino')
        )
    ) {
        return 'browser';
    } else if (options.moduleFormat === 'esm') {
        return 'neutral';
    }

    return undefined;
}

export default async function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    let entryPoints: { in: string; out: string }[] | string[] | undefined;
    let outdir: string | undefined;

    if (options.entryFilePath && options.outFilePath) {
        entryPoints = [
            {
                in: options.entryFilePath,
                out: options.outFilePath
            }
        ];
    } else if (options.entryFilePath && !options.outFilePath) {
        entryPoints = [options.entryFilePath];
        outdir = options.outDir;
    } else {
        outdir = options.outDir;
    }

    const moduleFormat = options.moduleFormat === 'umd' ? 'iife' : options.moduleFormat;
    const platform = getEsBuildPlatform(options);
    const targets = getEsBuildTargets(options);

    try {
        const dryRunSuffix = options.dryRun ? ' [dry run]' : '';
        logger.info(`Bundling with ${colors.lightMagenta('esbuild')}...${dryRunSuffix}`);

        if (options.entryFilePath) {
            logger.info(
                `With entry file: ${normalizePathToPOSIXStyle(path.relative(process.cwd(), options.entryFilePath))}`
            );
        }

        if (options.tsConfigInfo?.configPath) {
            logger.info(
                `With tsconfig file: ${normalizePathToPOSIXStyle(
                    path.relative(process.cwd(), options.tsConfigInfo.configPath)
                )}`
            );
        }

        if (moduleFormat) {
            logger.info(`With module format: ${moduleFormat}`);
        }

        if (platform) {
            logger.info(`With platform: ${platform}`);
        }

        if (targets.length > 0) {
            logger.info(`With target: ${targets.join(',')}`);
        }

        const startTime = Date.now();

        const esbuildResult = await esbuild.build({
            entryPoints,
            outdir,
            bundle: true,
            // TODO: Substitutions
            banner: options.banner ? { js: options.banner } : undefined,
            footer: options.footer ? { js: options.footer } : undefined,
            sourcemap: options.sourceMap ? 'linked' : false,
            minify: options.minify,
            format: moduleFormat,
            platform,
            target: targets,
            tsconfig: options.tsConfigInfo?.configPath,
            external: options.externals ? [...options.externals] : undefined,
            globalName: options.globalName,
            write: false,
            preserveSymlinks: options.preserveSymlinks,
            logLevel: 'silent'
        });

        if (esbuildResult.errors.length > 0) {
            const formattedMessages = await esbuild.formatMessages(esbuildResult.errors, {
                kind: 'error',
                color: true
                // terminalWidth: 100
            });

            throw new CompilationError(
                colors.lightRed('Running esbuild compilation task failed with errors:') +
                    '\n' +
                    formattedMessages.join('\n').trim()
            );
        } else if (esbuildResult.warnings.length > 0) {
            const formattedMessages = await esbuild.formatMessages(esbuildResult.warnings, {
                kind: 'warning',
                color: false
            });

            logger.warn(formattedMessages.join('\n').trim());
        }

        const duration = Date.now() - startTime;
        const builtAssets: CompileAsset[] = [];

        for (const outputFile of esbuildResult.outputFiles) {
            const pathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), outputFile.path));
            const size = outputFile.contents.length;

            if (options.dryRun) {
                logger.debug(`Built: ${pathRel}, size: ${formatSizeInBytes(size)}`);
            } else {
                const dirOfFilePath = path.dirname(outputFile.path);

                if (!(await pathExists(dirOfFilePath))) {
                    await fs.mkdir(dirOfFilePath, { recursive: true });
                }

                await fs.writeFile(outputFile.path, outputFile.contents, 'utf-8');
                logger.debug(`Emitted: ${pathRel}, size: ${formatSizeInBytes(size)}`);
            }

            builtAssets.push({
                path: outputFile.path,
                size,
                // TODO: Check with entry file path
                isEntry:
                    options.entryFilePath && options.outFilePath && isSamePath(outputFile.path, options.outFilePath)
                        ? true
                        : false
            });
        }

        const builtAssetsCount = builtAssets.length;
        const msgSuffix = options.dryRun ? 'built' : 'emitted';
        const fileverb = builtAssetsCount > 1 ? 'files are' : 'file is';
        logger.info(`Total ${builtAssetsCount} ${fileverb} ${msgSuffix}.`);

        return {
            time: duration,
            builtAssets
        };
    } catch (err) {
        if (!err) {
            throw new CompilationError(colors.lightRed('Running esbuild compilation task failed.'));
        }

        let errorMessage = colors.lightRed('Running esbuild compilation task failed with errors:');

        if ((err as esbuild.BuildResult)?.errors && (err as esbuild.BuildResult).errors.length > 0) {
            const formattedMessages = await esbuild.formatMessages((err as esbuild.BuildResult).errors, {
                kind: 'error',
                color: true
            });

            errorMessage += '\n' + formattedMessages.join('\n').trim();
        } else if ((err as esbuild.BuildResult)?.warnings && (err as esbuild.BuildResult).warnings.length > 0) {
            const formattedMessages = await esbuild.formatMessages((err as esbuild.BuildResult).warnings, {
                kind: 'warning',
                color: true
            });

            errorMessage += '\n' + formattedMessages.join('\n').trim();
        }

        throw new CompilationError(errorMessage);
    }
}
