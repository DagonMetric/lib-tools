/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import * as path from 'node:path';

import { CompilerOptions, SourceFile, WriteFileCallbackData } from 'typescript';

import {
    LoggerBase,
    colors,
    isInFolder,
    isSamePath,
    normalizePathToPOSIXStyle
} from '../../../../../../utils/index.mjs';

import { CompilationError } from '../../../../../exceptions/index.mjs';

import { CompileAsset, CompileOptions, CompileResult } from '../interfaces.mjs';
import { ts } from '../tsproxy.mjs';

const regExpEscapePattern = /[.*+?^${}()|[\]\\]/g;

function getTsCompilerOptions(options: CompileOptions): CompilerOptions {
    const compilerOptions: CompilerOptions = options.tsConfigInfo?.compilerOptions
        ? { ...options.tsConfigInfo.compilerOptions }
        : {};

    compilerOptions.outDir = options.outDir;

    if (options.entryFilePath) {
        compilerOptions.rootDir = path.dirname(options.entryFilePath);

        if (/\.(jsx|mjs|cjs|js)$/i.test(options.entryFilePath)) {
            compilerOptions.allowJs = true;
        }
    }

    if (options.scriptTarget != null) {
        const scriptTarget = ts.ScriptTarget[options.scriptTarget];
        compilerOptions.target = scriptTarget;
    }

    if (options.moduleFormat === 'cjs') {
        if (
            compilerOptions.module == null ||
            (compilerOptions.module !== ts.ModuleKind.CommonJS &&
                compilerOptions.module !== ts.ModuleKind.Node16 &&
                compilerOptions.module !== ts.ModuleKind.NodeNext)
        ) {
            if (compilerOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext) {
                compilerOptions.module = ts.ModuleKind.NodeNext;
            } else if (compilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16) {
                compilerOptions.module = ts.ModuleKind.Node16;
            } else {
                compilerOptions.module = ts.ModuleKind.CommonJS;
            }
        }
    } else if (options.moduleFormat === 'esm') {
        if (
            compilerOptions.module == null ||
            compilerOptions.module === ts.ModuleKind.None ||
            compilerOptions.module === ts.ModuleKind.AMD ||
            compilerOptions.module === ts.ModuleKind.CommonJS ||
            compilerOptions.module === ts.ModuleKind.System ||
            compilerOptions.module === ts.ModuleKind.UMD
        ) {
            if (compilerOptions.moduleResolution === ts.ModuleResolutionKind.NodeNext) {
                compilerOptions.module = ts.ModuleKind.NodeNext;
            } else if (compilerOptions.moduleResolution === ts.ModuleResolutionKind.Node16) {
                compilerOptions.module = ts.ModuleKind.Node16;
            } else if (compilerOptions.target && compilerOptions.target > ts.ScriptTarget.ES2022) {
                compilerOptions.module = ts.ModuleKind.ESNext;
            } else if (compilerOptions.target && compilerOptions.target > ts.ScriptTarget.ES2020) {
                compilerOptions.module = ts.ModuleKind.ES2022;
            } else if (compilerOptions.target && compilerOptions.target > ts.ScriptTarget.ES2015) {
                compilerOptions.module = ts.ModuleKind.ES2020;
            } else {
                compilerOptions.module = ts.ModuleKind.ES2015;
            }
        }
    } else if (options.moduleFormat === 'iife') {
        if (compilerOptions.module == null) {
            compilerOptions.module = ts.ModuleKind.ES2015;
        }
    }

    if (options.declaration != null) {
        compilerOptions.declaration = options.declaration;
    }

    if (options.emitDeclarationOnly != null) {
        compilerOptions.emitDeclarationOnly = options.emitDeclarationOnly;
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
        if (options.sourceMap) {
            if (options.entryFilePath) {
                compilerOptions.sourceRoot = path.dirname(options.entryFilePath);
            }

            if (
                (compilerOptions.sourceMap != null && compilerOptions.inlineSourceMap != null) ||
                (!compilerOptions.sourceMap && !compilerOptions.inlineSourceMap)
            ) {
                compilerOptions.sourceMap = true;
                compilerOptions.inlineSourceMap = false;
            }
        } else {
            compilerOptions.sourceMap = false;
            compilerOptions.inlineSourceMap = false;
            compilerOptions.inlineSources = false;
            compilerOptions.sourceRoot = undefined;
        }
    }

    if (options.preserveSymlinks != null) {
        compilerOptions.preserveSymlinks = options.preserveSymlinks;
    }

    return compilerOptions;
}

export default function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    const { projectRoot } = options.taskInfo;
    const compilerOptions = getTsCompilerOptions(options);

    if (compilerOptions.emitDeclarationOnly) {
        logger.info(`Generating typing declaration files with ${colors.lightMagenta('tsc')}...`);
    } else {
        logger.info(`Compiling with ${colors.lightMagenta('tsc')}...`);
    }

    if (options.entryFilePath && options.preferredEntryFilePath) {
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

    if (options.scriptTarget != null) {
        logger.info(`With script target: '${options.scriptTarget}'`);
    }

    if (compilerOptions.module != null) {
        logger.info(`With module format: '${ts.ModuleKind[compilerOptions.module]}'`);
    }

    const host = ts.createCompilerHost(compilerOptions);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const baseReadFile = host.readFile;
    host.readFile = function (filePath: string) {
        let file: string | undefined = baseReadFile.call(host, filePath);
        const filePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), filePath));
        if (file && isInFolder(projectRoot, filePath) && /\.(m[tj]s|c[tj]s|[tj]sx?)$/.test(filePath)) {
            if (!compilerOptions.emitDeclarationOnly && options.substitutions) {
                for (const substitution of options.substitutions.filter(
                    (s) => !s.bannerOnly && (!s.files || s.files.some((sf) => isSamePath(filePath, sf)))
                )) {
                    const escapedPattern = substitution.searchValue.replace(regExpEscapePattern, '\\$&'); // $& means the whole matched string
                    const searchRegExp = new RegExp(
                        `${substitution.startDelimiter ?? '\\b'}${escapedPattern}${
                            substitution.endDelimiter ?? '\\b(?!\\.)'
                        }`,
                        'g'
                    );

                    const m = file.match(searchRegExp);
                    if (m != null && m.length > 0) {
                        const matchedText = m[0];
                        logger.debug(
                            `Substituting '${matchedText}' with value '${substitution.replaceValue}' in file ${filePathRel}`
                        );
                        file = file.replace(searchRegExp, substitution.replaceValue);
                    }
                }
            }

            // if (
            //     options.banner &&
            //     !file.trimStart().startsWith(options.banner.trim()) &&
            //     !file.startsWith('#!/usr/bin/env')
            // ) {
            //     logger.debug(`Adding banner to file ${filePathRel}`);
            //     file = `${options.banner.trim()}\n${host.getNewLine()}${file}`;
            // }
        }

        return file;
    };

    const entryFileName = options.entryFilePath ? path.basename(options.entryFilePath) : undefined;
    const entryOuputPathWithoutExt = entryFileName
        ? path.resolve(
              options.outDir,
              entryFileName.substring(0, entryFileName.length - path.extname(entryFileName).length)
          )
        : undefined;

    const outFilePath = options.outFilePath;
    const outFileName = outFilePath ? path.basename(outFilePath) : undefined;
    const outFileNameWithoutExt = outFileName
        ? outFileName.substring(0, outFileName.length - path.extname(outFileName).length)
        : undefined;

    const builtAssets: CompileAsset[] = [];
    let hasEntry = false;

    const baseWriteFile = host.writeFile;
    host.writeFile = (
        filePath: string,
        content: string,
        writeByteOrderMark: boolean,
        onError?: (message: string) => void,
        sourceFiles?: readonly SourceFile[],
        data?: WriteFileCallbackData
    ) => {
        let adjustedOutFilePath = filePath;
        let isEntry = false;

        if (entryOuputPathWithoutExt && outFilePath && outFileNameWithoutExt) {
            const lastExtName = path.extname(filePath);
            const filePathWithoutExt = filePath.substring(0, filePath.length - lastExtName.length);
            let testEntryOutPath = entryOuputPathWithoutExt;
            if (/\.d$/i.test(filePathWithoutExt)) {
                testEntryOutPath += path.extname(filePathWithoutExt);
            }

            if (isSamePath(filePath, outFilePath)) {
                isEntry = true;
                hasEntry = true;
            } else if (lastExtName.toLowerCase() === '.map') {
                const jsExtName = path.extname(filePathWithoutExt);
                const filePathWithoutAllExt = filePathWithoutExt.substring(
                    0,
                    filePathWithoutExt.length - jsExtName.length
                );

                if (isSamePath(filePathWithoutAllExt, testEntryOutPath)) {
                    adjustedOutFilePath = `${path.dirname(filePath)}${outFileNameWithoutExt}${jsExtName}${lastExtName}`;
                }
            } else if (isSamePath(filePathWithoutExt, testEntryOutPath)) {
                isEntry = true;
                hasEntry = true;

                adjustedOutFilePath = `${path.dirname(filePath)}${outFileNameWithoutExt}${lastExtName}`;
            }
        }

        const filePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), adjustedOutFilePath));

        let newContent = content;

        if (options.banner && !content.startsWith('#!/usr/bin/env') && !content.startsWith(options.banner.trim())) {
            let shouldAddBanner = true;

            if ((content.startsWith('/*') || content.startsWith('//')) && content.length >= options.banner.length) {
                const normalizedContent = content
                    .split(/[\r\n]/)
                    .filter((l) => l.trim().length > 0)
                    .join('\n');

                if (normalizedContent.startsWith(options.banner)) {
                    shouldAddBanner = false;
                }
            }

            if (shouldAddBanner) {
                logger.debug(`Adding banner to file ${filePathRel}`);
                newContent = `${options.banner.trim()}${host.getNewLine()}${content}`;
            }
        }

        const size = Buffer.byteLength(newContent, 'utf-8');

        if (options.dryRun) {
            logger.info(`Built: ${filePathRel}`);
        } else {
            baseWriteFile.call(host, adjustedOutFilePath, newContent, writeByteOrderMark, onError, sourceFiles, data);

            logger.info(`Emitted: ${filePathRel}`);
        }

        builtAssets.push({
            path: path.resolve(adjustedOutFilePath),
            size,
            isEntry
        });
    };

    let filePaths: string[] = [];
    if (
        options.tsConfigInfo?.fileNames &&
        options.tsConfigInfo?.fileNames.length > 0 &&
        !options.preferredEntryFilePath
    ) {
        filePaths = [...options.tsConfigInfo.fileNames];
    } else if (options.entryFilePath) {
        filePaths = [options.entryFilePath];
    }

    const program = ts.createProgram(filePaths, compilerOptions, host);

    const startTime = Date.now();

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

    if (!hasEntry) {
        logger.warn('No exportable entry found in the generated output paths.');
    }

    const result: CompileResult = {
        builtAssets,
        time: Date.now() - startTime
    };

    return Promise.resolve(result);
}
