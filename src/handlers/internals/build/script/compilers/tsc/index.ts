import * as path from 'node:path';

import { CompilerOptions, SourceFile } from 'typescript';

import {
    LoggerBase,
    colors,
    isInFolder,
    isSamePath,
    normalizePathToPOSIXStyle
} from '../../../../../../utils/index.js';

import { CompilationError } from '../../../../../exceptions/index.js';

import { CompileOptions, CompileResult } from '../interfaces.js';
import { ts } from '../tsproxy.js';

function getTsCompilerOptions(options: CompileOptions): CompilerOptions {
    const compilerOptions: CompilerOptions = options.tsConfigInfo?.compilerOptions
        ? { ...options.tsConfigInfo.compilerOptions }
        : {};

    compilerOptions.outDir = path.dirname(options.outFilePath);
    compilerOptions.rootDir = path.dirname(options.entryFilePath);

    if (/\.(jsx|mjs|cjs|js)$/i.test(options.entryFilePath)) {
        compilerOptions.allowJs = true;
    }

    if (compilerOptions.target !== ts.ScriptTarget[options.scriptTarget]) {
        compilerOptions.target = ts.ScriptTarget[options.scriptTarget];
    }

    if (options.moduleFormat === 'cjs') {
        if (
            compilerOptions.module == null ||
            (compilerOptions.module !== ts.ModuleKind.CommonJS &&
                compilerOptions.module !== ts.ModuleKind.Node16 &&
                compilerOptions.module !== ts.ModuleKind.NodeNext)
        ) {
            if ((compilerOptions.target as number) > 8) {
                // TODO: To review
                compilerOptions.module = ts.ModuleKind.NodeNext;
            } else {
                // TODO: To review
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
            // TODO: To review
            compilerOptions.module = ts.ModuleKind.ESNext;
        }
    } else if (options.moduleFormat === 'iife') {
        if (compilerOptions.module !== ts.ModuleKind.System && compilerOptions.module !== ts.ModuleKind.UMD) {
            compilerOptions.module = ts.ModuleKind.UMD;
        }

        // TODO: To review
        if (compilerOptions.moduleResolution !== ts.ModuleResolutionKind.Node10) {
            compilerOptions.moduleResolution = ts.ModuleResolutionKind.Node10;
        }
    }

    if (options.emitDeclarationOnly != null) {
        compilerOptions.emitDeclarationOnly = options.emitDeclarationOnly;
    }

    if (options.declaration != null) {
        compilerOptions.declaration = options.declaration;
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
            compilerOptions.sourceRoot = path.dirname(options.entryFilePath);

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

    return compilerOptions;
}

/**
 * @internal
 */
export default function (options: CompileOptions, logger: LoggerBase): Promise<CompileResult> {
    const { projectRoot } = options.taskInfo;
    const outFileName = path.basename(options.outFilePath);
    const outFileExt = path.extname(options.outFilePath);
    const entryOutFileWithoutExt = options.entryFilePath.substring(
        0,
        options.entryFilePath.length - path.extname(options.entryFilePath).length
    );
    const compilerOptions = getTsCompilerOptions(options);

    const builtAssets: { path: string; size: number }[] = [];

    if (compilerOptions.emitDeclarationOnly) {
        logger.info(`Generating typing declaration files with ${colors.lightMagenta('tsc')}...`);
    } else {
        logger.info(`Compiling with ${colors.lightMagenta('tsc')}...`);
    }

    const entryFilePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), options.entryFilePath));
    logger.info(`With entry file: ${entryFilePathRel}`);

    if (options.tsConfigInfo?.configPath) {
        const tsConfigPathRel = normalizePathToPOSIXStyle(
            path.relative(process.cwd(), options.tsConfigInfo.configPath)
        );

        logger.info(`With tsconfig file: ${tsConfigPathRel}`);
    }

    let infoMsg = `With script target: '${options.scriptTarget}'`;
    if (compilerOptions.module != null) {
        infoMsg += `, module format: '${ts.ModuleKind[compilerOptions.module]}'`;
    }
    logger.info(infoMsg);

    const startTime = Date.now();
    const host = ts.createCompilerHost(compilerOptions);

    const baseWriteFile = host.writeFile;
    host.writeFile = (
        filePath: string,
        content: string,
        writeByteOrderMark: boolean,
        onError?: (message: string) => void,
        sourceFiles?: readonly SourceFile[]
    ) => {
        let newOutFilePath = filePath;

        if (
            isSamePath(filePath.substring(0, filePath.length - path.extname(filePath).length), entryOutFileWithoutExt)
        ) {
            newOutFilePath = filePath.substring(0, filePath.length - path.basename(filePath).length) + outFileName;
        } else if (!compilerOptions.emitDeclarationOnly && outFileExt !== '.js') {
            newOutFilePath = newOutFilePath.replace(/\.js(\.map)?$/, `${outFileExt}$1`);
        }

        const pathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), newOutFilePath));
        const size = Buffer.byteLength(content, 'utf-8');

        if (options.dryRun) {
            logger.info(`Built: ${pathRel}`);
        } else {
            baseWriteFile.call(host, newOutFilePath, content, writeByteOrderMark, onError, sourceFiles);
            logger.info(`Emitted: ${pathRel}`);
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
            if (!compilerOptions.emitDeclarationOnly && options.substitutions) {
                for (const substitution of options.substitutions.filter((s) => !s.bannerOnly)) {
                    const escapedPattern = substitution.searchValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    // TODO: start and end delimiter
                    const searchRegExp = new RegExp(escapedPattern, 'g');

                    const m = file.match(searchRegExp);
                    if (m != null && m.length > 0) {
                        const matchedText = m[0];
                        logger.debug(
                            `Substituting ${matchedText} with value '${substitution.replaceValue}' in file ${filePathRel}`
                        );
                        file = file.replace(searchRegExp, substitution.replaceValue);
                    }
                }
            }

            // TODO: Include / Exclude
            if (options.banner && !file.trim().startsWith(options.banner.text.trim())) {
                logger.debug(`Adding banner to file ${filePathRel}`);
                file = `${options.banner.text}\n${host.getNewLine()}${file}`;
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

    return Promise.resolve(result);
}
