import * as esbuild from 'esbuild';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { LoggerBase, colors } from '../../../../../../utils/index.js';
import { formatSizeInBytes, normalizePathToPOSIXStyle, pathExists } from '../../../../../../utils/internals/index.js';

import { CompilationError } from '../../../../../exceptions/index.js';

import { CompileAsset, CompileOptions, CompileResult } from '../interfaces.js';

function getEsBuildTargets(options: CompileOptions): string[] {
    const targets: string[] = [options.scriptTarget.toLowerCase()];
    if (options.environmentTargets) {
        for (const target of options.environmentTargets) {
            if (target === 'web') {
                continue;
            }
            targets.push(target);
        }
    }

    return targets;
}

function getEsBuildPlatform(options: CompileOptions): esbuild.Platform | undefined {
    if (options.moduleFormat === 'esm') {
        return 'neutral';
    } else if (
        options.moduleFormat === 'cjs' ||
        path.extname(options.outFilePath).toLowerCase() === '.cjs' ||
        options.environmentTargets?.some((t) => t.startsWith('node') || t.startsWith('deno'))
    ) {
        return 'node';
    } else if (options.moduleFormat === 'iife' || options.environmentTargets?.some((t) => t === 'web')) {
        return 'browser';
    }

    return undefined;
}

/**
 * @internal
 */
export default async function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    logger.info(
        `Bundling with esbuild, module format: ${options.moduleFormat}, script target: ${options.scriptTarget}...`
    );

    try {
        const startTime = Date.now();

        const esbuildResult = await esbuild.build({
            entryPoints: [options.entryFilePath],
            outfile: options.outFilePath,
            bundle: true,
            // TODO: Include & Exclude
            banner: options.banner ? { js: options.banner.text } : undefined,
            footer: options.footer ? { js: options.footer.text } : undefined,
            sourcemap: options.sourceMap ? 'linked' : false,
            minify: options.minify,
            format: options.moduleFormat === 'umd' ? 'iife' : options.moduleFormat,
            target: getEsBuildTargets(options),
            platform: getEsBuildPlatform(options),
            tsconfig: options.tsConfigInfo?.configPath,
            external: options.externals ? [...options.externals] : undefined,
            globalName: options.globalName,
            write: false,
            preserveSymlinks: options.tsConfigInfo?.compilerOptions.preserveSymlinks,
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
                size
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
