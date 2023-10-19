/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import * as path from 'node:path';

import { SourceFile, WriteFileCallbackData } from 'typescript';

import { LoggerBase, colors, isSamePath, normalizePathToPOSIXStyle } from '../../../../../../utils/index.mjs';

import { CompilationError, InvalidConfigError } from '../../../../../exceptions/index.mjs';

import { CompileAsset, CompileOptions, CompileResult } from '../compile-interfaces.mjs';
import { getEntryOutFileInfo } from '../compile-options-helpers.mjs';
import { ts } from '../tsproxy.mjs';

const regExpEscapePattern = /[.*+?^${}()|[\]\\]/g;

export default function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    const compilerOptions = options.tsConfigInfo?.compilerOptions ?? {};
    const { emitDeclarationOnly } = compilerOptions;

    let entryFilePaths: string[];
    if (options.entryPoints && (options.entryPointsPreferred === true || !options.tsConfigInfo?.fileNames)) {
        if (Array.isArray(options.entryPoints)) {
            entryFilePaths = [...options.entryPoints];
        } else {
            entryFilePaths = Object.entries(options.entryPoints).map((pair) => pair[1]);
        }
    } else if (options.tsConfigInfo?.fileNames) {
        entryFilePaths = [...options.tsConfigInfo.fileNames];
    } else {
        throw new InvalidConfigError(
            `No file to compile. Specify 'entry' in script options or specify 'include' in tsconfig file.`,
            null,
            null
        );
    }

    if (emitDeclarationOnly) {
        logger.info(`Generating typing declaration files with ${colors.lightMagenta('tsc')}...`);
    } else {
        logger.info(`Compiling with ${colors.lightMagenta('tsc')}...`);
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
        if (file && /\.(m[tj]s|c[tj]s|[tj]sx?)$/.test(filePath)) {
            if (!emitDeclarationOnly && options.substitutions) {
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

    const builtAssets: CompileAsset[] = [];
    const projectRoot = options.taskInfo.projectRoot;
    const entryRoot = compilerOptions.rootDir;

    const baseWriteFile = host.writeFile;
    host.writeFile = (
        filePath: string,
        content: string,
        writeByteOrderMark: boolean,
        onError?: (message: string) => void,
        sourceFiles?: readonly SourceFile[],
        data?: WriteFileCallbackData
    ) => {
        const entryOutFileInfo = options.entryPoints
            ? getEntryOutFileInfo({
                  currentOutFilePath: filePath,
                  outDir: options.outDir,
                  outBase: undefined,
                  entryPoints: options.entryPoints,
                  projectRoot,
                  entryRoot
              })
            : undefined;

        const outFilePath = entryOutFileInfo?.outFilePath ?? filePath;
        const isEntry = entryOutFileInfo?.isEntry ?? false;

        const filePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), outFilePath));

        let newContent = content;

        if (
            options.banner &&
            !/\.(map|json)$/i.test(filePath) &&
            !content.startsWith('#!/usr/bin/env') &&
            !content.startsWith(options.banner.trim())
        ) {
            let shouldAddBanner = true;

            if (
                (content.trimStart().startsWith('/*') || content.trimStart().startsWith('//')) &&
                content.length >= options.banner.length
            ) {
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
            baseWriteFile.call(host, outFilePath, newContent, writeByteOrderMark, onError, sourceFiles, data);

            logger.info(`Emitted: ${filePathRel}`);
        }

        builtAssets.push({
            path: path.resolve(outFilePath),
            size,
            isEntry
        });
    };

    const program = ts.createProgram(entryFilePaths, compilerOptions, host);

    const startTime = Date.now();

    const emitResult = program.emit(undefined, undefined, undefined, emitDeclarationOnly);

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

    return Promise.resolve(result);
}
