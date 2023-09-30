/* eslint-disable import/default */
/* eslint-disable import/no-named-as-default-member */

import * as path from 'node:path';

import ts from 'typescript';

import { CompilationError } from '../../../../../../exceptions/index.js';
import {
    LoggerBase,
    colors,
    formatSizeInBytes,
    isInFolder,
    isSamePaths,
    normalizePathToPOSIXStyle
} from '../../../../../../utils/index.js';

import { CompileOptions } from '../../compile-options.js';
import { CompileResult } from '../../compile-result.js';

export default function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    const projectRoot = options.workspaceInfo.projectRoot;
    const outDir = path.dirname(options.outFilePath);
    const outFileName = path.basename(options.outFilePath);
    const outFileExt = path.extname(options.outFilePath);
    const entryOutFileWithoutExt = options.entryFilePath.substring(
        0,
        options.entryFilePath.length - path.extname(options.entryFilePath).length
    );

    const builtAssets: { path: string; size: number }[] = [];

    const compilerOptions: ts.CompilerOptions = options.tsConfigInfo?.compilerOptions
        ? { ...options.tsConfigInfo.compilerOptions }
        : {};

    compilerOptions.outDir = outDir;
    if (compilerOptions.rootDir != null) {
        compilerOptions.rootDir = path.dirname(options.entryFilePath);
    }

    if (compilerOptions.sourceMap != null && compilerOptions.inlineSourceMap != null) {
        compilerOptions.sourceMap = undefined;
    }

    if (compilerOptions.emitDeclarationOnly) {
        compilerOptions.declaration = true;
        compilerOptions.sourceMap = undefined;
        compilerOptions.inlineSourceMap = undefined;
        compilerOptions.inlineSources = undefined;
        compilerOptions.sourceRoot = undefined;
        if (compilerOptions.types && !compilerOptions.types.length) {
            compilerOptions.types = undefined;
        }
    } else {
        if (options.sourceMap != null) {
            if (compilerOptions.sourceMap != null) {
                compilerOptions.sourceMap = options.sourceMap;
            } else {
                compilerOptions.inlineSourceMap = options.sourceMap;
            }
        }

        if (compilerOptions.inlineSources == null && (compilerOptions.inlineSourceMap ?? compilerOptions.sourceMap)) {
            compilerOptions.inlineSources = true;
        }

        if (compilerOptions.sourceRoot != null) {
            compilerOptions.sourceRoot = path.dirname(options.entryFilePath);
        }
    }

    if (/\.(jsx|mjs|cjs|js)$/i.test(options.entryFilePath)) {
        compilerOptions.allowJs = true;
    }

    if (compilerOptions.emitDeclarationOnly) {
        logger.info('Generating typing declaration files with typescript...');
    } else {
        logger.info(
            `Compiling with typescript, module format: ${options.moduleFormat}, script target: ${options.scriptTarget}...`
        );
    }

    const startTime = Date.now();
    const host = ts.createCompilerHost(compilerOptions);

    const baseWriteFile = host.writeFile;
    host.writeFile = (
        filePath: string,
        content: string,
        writeByteOrderMark: boolean,
        onError?: (message: string) => void,
        sourceFiles?: readonly ts.SourceFile[]
    ) => {
        let newOutFilePath = filePath;

        if (
            isSamePaths(filePath.substring(0, filePath.length - path.extname(filePath).length), entryOutFileWithoutExt)
        ) {
            newOutFilePath = filePath.substring(0, filePath.length - path.basename(filePath).length) + outFileName;
        } else if (!compilerOptions.emitDeclarationOnly && outFileExt !== '.js') {
            newOutFilePath = newOutFilePath.replace(/\.js(\.map)?$/, `${outFileExt}$1`);
        }

        const pathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), newOutFilePath));
        const size = Buffer.byteLength(content, 'utf-8');

        if (options.dryRun) {
            logger.debug(`Built: ${pathRel}, size: ${formatSizeInBytes(size)}`);
        } else {
            baseWriteFile.call(host, newOutFilePath, content, writeByteOrderMark, onError, sourceFiles);
            logger.debug(`Emitted: ${pathRel}, size: ${formatSizeInBytes(size)}`);
        }

        builtAssets.push({
            path: newOutFilePath,
            size
        });
    };

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const baseReadFile = host.readFile;
    host.readFile = function (filePath: string) {
        let file: string | undefined = baseReadFile.call(host, filePath);
        const filePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), filePath));
        if (file && isInFolder(projectRoot, filePath) && /\.(m[tj]s|c[tj]s|[tj]sx?)$/.test(filePath)) {
            if (!compilerOptions.emitDeclarationOnly) {
                for (const substitution of options.substitutions.filter((s) => !s.bannerOnly)) {
                    if (substitution.test.test(file)) {
                        logger.debug(
                            `Substituting ${substitution.description} with value '${substitution.value}' in file ${filePathRel}`
                        );
                        file = file.replace(substitution.test, substitution.value);
                    }
                }
            }

            if (options.bannerText) {
                logger.debug(`Adding banner to file ${filePathRel}`);
                file = `${options.bannerText}\n${host.getNewLine()}${file}`;
            }
        }

        return file;
    };

    const program = ts.createProgram([options.entryFilePath], compilerOptions, host);

    const emitResult = program.emit(
        undefined,
        undefined,
        undefined,
        compilerOptions.emitDeclarationOnly ? true : undefined
    );

    // const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    const allDiagnostics = emitResult.diagnostics;
    if (allDiagnostics.length) {
        const errorLines = allDiagnostics.map((diagnostic) => {
            if (diagnostic.file) {
                const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start!);
                const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
                const pathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), diagnostic.file.fileName));
                const lineAndCol = `${line + 1}:${character + 1}`;
                return `${colors.lightCyan(pathRel)}:${colors.lightYellow(lineAndCol)} - ${colors.lightRed(
                    'error:'
                )} ${message}`;
            } else {
                return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            }
        });

        let errorMessage = colors.lightRed('Running script compilation task failed with errors:') + '\n';
        errorMessage += errorLines.join('\n');

        throw new CompilationError(errorMessage);
    }

    const result: CompileResult = {
        builtAssets,
        time: Date.now() - startTime
    };

    const builtAssetsCount = builtAssets.length;
    const msgSuffix = options.dryRun ? 'built' : 'emitted';
    const fileverb = builtAssetsCount > 1 ? 'files are' : 'file is';
    logger.info(`Total ${builtAssetsCount} ${fileverb} ${msgSuffix}.`);

    return Promise.resolve(result);
}
