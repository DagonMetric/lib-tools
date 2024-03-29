/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import * as esbuild from 'esbuild';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
    LoggerBase,
    colors,
    formatSizeInBytes,
    getShortestBasePath,
    isInFolder,
    normalizePathToPOSIXStyle,
    pathExists
} from '../../../../../../utils/index.mjs';

import { CompilationError } from '../../../../../exceptions/index.mjs';

import { CompileAsset, CompileOptions, CompileResult } from '../compile-interfaces.mjs';
import { getEntryOutFileInfo } from '../compile-options-helpers.mjs';

function getEsBuildModuleFormat(options: CompileOptions): esbuild.Format | undefined {
    if (options.moduleFormat === 'esm') {
        return 'esm';
    } else if (options.moduleFormat === 'cjs') {
        return 'cjs';
    } else if (options.moduleFormat === 'iife' || options.moduleFormat === 'umd') {
        return 'iife';
    } else {
        return undefined;
    }
}

function getEsBuildTargets(options: CompileOptions): string[] {
    const targets: string[] = ['esnext'];

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
    const moduleFormat = getEsBuildModuleFormat(options);
    if (!moduleFormat) {
        logger.warn(`Module format '${options.moduleFormat}' is currently not supported in esbuild compiler tool.`);
    }

    const platform = getEsBuildPlatform(options);
    const targets = getEsBuildTargets(options);

    let entryPoints: Record<string, string> | string[] | undefined;
    if (options.entryPoints && options.entryPointsPreferred !== false) {
        entryPoints = options.entryPoints;
    } else {
        entryPoints = options.tsConfigInfo?.fileNames ? [...options.tsConfigInfo.fileNames] : undefined;
    }

    const { projectRoot } = options.taskInfo;
    let entryRoot: string | undefined;
    let outBase: string | undefined;
    let suggestedJsOutExt = '.js';

    if (entryPoints) {
        const entryFilePaths = Array.isArray(entryPoints) ? entryPoints : Object.entries(entryPoints).map((e) => e[1]);
        if (entryFilePaths.length > 1) {
            // TODO:
            const rootBasePath = getShortestBasePath(entryFilePaths.map((p) => path.dirname(p)));

            if (rootBasePath && isInFolder(projectRoot, rootBasePath)) {
                entryRoot = rootBasePath;
                outBase = normalizePathToPOSIXStyle(path.relative(projectRoot, entryRoot));
            }
        } else if (entryFilePaths.length === 1) {
            entryRoot = path.dirname(entryFilePaths[0]);
        }

        if (moduleFormat === 'esm' && entryFilePaths.some((e) => /\.m[tj]s$/i.test(e))) {
            suggestedJsOutExt = '.mjs';
        } else if (moduleFormat === 'cjs' && entryFilePaths.some((e) => /\.c[tj]s$/i.test(e))) {
            suggestedJsOutExt = '.cjs';
        } else if (entryFilePaths.some((e) => /\.[tj]sx$/i.test(e))) {
            suggestedJsOutExt = '.jsx';
        }
    }

    logger.info(
        `${options.bundle ? 'Bundling' : 'Compiling'} with ${colors.lightMagenta('esbuild')}...${
            options.dryRun ? ' [dry run]' : ''
        }`
    );

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

    try {
        const startTime = Date.now();

        const esbuildResult = await esbuild.build({
            entryPoints,
            outdir: options.outDir,
            outbase: outBase,
            // TODO: configuraable
            outExtension: { '.js': suggestedJsOutExt },
            assetNames: options.assetOut ? options.assetOut : '[dir]/[name]',
            bundle: options.bundle,
            // TODO: Substitutions
            banner: options.banner ? { js: options.banner } : undefined,
            footer: options.footer ? { js: options.footer } : undefined,
            // TODO: configuraable
            sourcemap: options.sourceMap ? 'linked' : false,
            minify: options.minify,
            format: moduleFormat,
            platform,
            target: targets,
            tsconfig: options.tsConfigInfo?.configPath,
            external: options.bundle && options.externals ? [...options.externals] : undefined,
            packages: options.externals ?? !options.bundle ? undefined : 'external',
            globalName: options.globalName,
            loader: options.assetLoaders,
            treeShaking: options.treeshake != null ? options.treeshake !== false : undefined,
            write: false,
            preserveSymlinks: options.preserveSymlinks,
            logLevel: 'silent'
        });

        const duration = Date.now() - startTime;

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

        const builtAssets: CompileAsset[] = [];

        for (const outputFile of esbuildResult.outputFiles) {
            const pathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), outputFile.path));
            const size = outputFile.contents.length;

            if (options.dryRun) {
                logger.debug(`Built: ${pathRel} - size: ${formatSizeInBytes(size)}`);
            } else {
                const dirOfFilePath = path.dirname(outputFile.path);

                if (!(await pathExists(dirOfFilePath))) {
                    await fs.mkdir(dirOfFilePath, { recursive: true });
                }

                await fs.writeFile(outputFile.path, outputFile.contents, 'utf-8');
                logger.debug(`Emitted: ${pathRel} - size: ${formatSizeInBytes(size)}`);
            }

            builtAssets.push({
                path: outputFile.path,
                size,
                isEntry: entryPoints
                    ? getEntryOutFileInfo({
                          currentOutFilePath: outputFile.path,
                          outDir: options.outDir,
                          entryPoints,
                          projectRoot,
                          entryRoot
                      }).isEntry
                    : false
            });
        }

        return {
            time: duration,
            builtAssets
        };
    } catch (err) {
        if (!err) {
            throw new CompilationError(colors.lightRed('Running esbuild compilation task failed.'));
        }

        let errorMessage = colors.lightRed('Running esbuild compilation task failed with errors:');
        let formattedMessage = '';

        if ((err as esbuild.BuildResult)?.errors && (err as esbuild.BuildResult).errors.length > 0) {
            const formattedMessages = await esbuild.formatMessages((err as esbuild.BuildResult).errors, {
                kind: 'error',
                color: true
            });

            formattedMessage = formattedMessages.join('\n').trim();
        } else if ((err as esbuild.BuildResult)?.warnings && (err as esbuild.BuildResult).warnings.length > 0) {
            const formattedMessages = await esbuild.formatMessages((err as esbuild.BuildResult).warnings, {
                kind: 'warning',
                color: true
            });

            formattedMessage = formattedMessages.join('\n').trim();
        }

        if (formattedMessage) {
            errorMessage += '\n' + formattedMessage;
        } else {
            if ((err as Error).message && typeof (err as Error).message === 'string') {
                formattedMessage = (err as Error).message;
            } else if ((err as Error).stack && typeof (err as Error).stack === 'string') {
                formattedMessage = (err as Error).stack!;
            } else if (typeof err !== 'object') {
                formattedMessage = String(err);
            } else {
                // errMsg = unknownErrorPrefix + '\n' + util.format('%o', err);
                formattedMessage = JSON.stringify(err, null, 2);
            }

            if (formattedMessage.trim().length) {
                errorMessage += '\n' + formattedMessage.trim();
            }
        }

        throw new CompilationError(errorMessage);
    }
}
