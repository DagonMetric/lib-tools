import * as esbuild from 'esbuild';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { LogLevelStrings } from '../../../../../../utils/index.js';

import { CompileOptions } from '../../compile-options.js';
import { CompileResult } from '../../compile-result.js';

function toEsBuildLogLevel(logLevel: LogLevelStrings): esbuild.LogLevel {
    switch (logLevel) {
        case 'debug':
            return 'debug';
        case 'info':
            return 'info';
        case 'warn':
            return 'warning';
        case 'error':
            return 'error';
        default:
            return 'silent';
    }
}

// TODO:
function getEsBuildTargets(options: CompileOptions): string[] {
    const targets: string[] = [options.scriptTarget.toLowerCase()];
    if (options.environmentTargets) {
        for (const target of options.environmentTargets) {
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
        options.environmentTargets.find((t) => t.startsWith('node') || t.startsWith('deno')) != null
    ) {
        return 'node';
    } else {
        // TODO: To review
        return 'browser';
    }
}

export default async function (options: CompileOptions): Promise<CompileResult> {
    const startTime = Date.now();

    const esBuildResult = await esbuild.build({
        // entryNames
        entryPoints: [options.entryFilePath],
        // outExtension
        outdir: path.dirname(options.outFilePath),
        outfile: path.basename(options.outFilePath),
        banner: options.bannerText ? { js: options.bannerText } : undefined,
        sourcemap: options.sourceMap ? 'linked' : false,
        minify: options.minify,
        format: options.moduleFormat,
        target: getEsBuildTargets(options),
        platform: getEsBuildPlatform(options),
        tsconfig: options.tsConfigInfo?.configPath,
        bundle: options.bundle,
        external: options.externals,
        write: false,
        // treeShaking: options.treeShaking,
        // preserveSymlinks: options.preserveSymlinks,
        logLevel: toEsBuildLogLevel(options.logLevel)
        // plugins: []
    });

    const result: CompileResult = {
        builtAssets: [],
        time: Date.now() - startTime
    };

    if (!esBuildResult.outputFiles) {
        return result;
    }

    for (const outputFile of esBuildResult.outputFiles) {
        if (!options.dryRun) {
            await fs.writeFile(outputFile.path, outputFile.contents);
        }

        result.builtAssets.push({
            path: outputFile.path,
            size: outputFile.contents.length
        });
    }

    return result;
}
