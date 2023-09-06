import { glob } from 'glob';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export function normalizePathToPOSIXStyle(p: string): string {
    if (!p?.trim().length) {
        return '';
    }

    const backToForwardSlash: [RegExp, string] = [/\\/g, '/'];
    const replaces: [RegExp, string][] = [
        // [...backToForwardSlash],
        // [/(\w):/, '/$1'],
        // [/(\w+)\/\.\.\/?/g, ''], // already in path.posix.normalize(p)
        [/^\.\//, ''],
        // [/\/\.\//, '/'], // already in path.posix.normalize(p)
        // [/\/\.$/, ''], // already in path.posix.normalize(p)
        [/\/$/, ''],
        [/^\.$/, '']
    ];

    p = p.trim();
    p = p.replace(backToForwardSlash[0], backToForwardSlash[1]);

    let startingSlashes = '';
    for (const c of p) {
        if (c === '/') {
            startingSlashes += c;
        } else {
            break;
        }
    }

    p = path.posix.normalize(p);

    replaces.forEach((arr) => {
        while (arr[0].test(p)) {
            p = p.replace(arr[0], arr[1]);
        }
    });

    if (p.startsWith('/') && !/^\/{2,}/.test(p)) {
        p = p.substring(1);
    }

    if (/^\w:$/.test(p)) {
        p = p + '/';
    } else if (startingSlashes.length > 1 && !p.startsWith('/')) {
        p = startingSlashes + p;
    }

    return p;
}

export function isWindowsStyleAbsolute(p: string): boolean {
    if (!p) {
        return false;
    }

    p = normalizePathToPOSIXStyle(p);

    return path.win32.isAbsolute(p);
}

export function isSamePaths(p1: string, p2: string, ignoreCase = false): boolean {
    if (p1 === p2) {
        return true;
    }

    let normalizedP1 = normalizePathToPOSIXStyle(p1);
    let normalizedP2 = normalizePathToPOSIXStyle(p2);

    if (ignoreCase || process.platform === 'win32') {
        normalizedP1 = normalizedP1.toLowerCase();
        normalizedP2 = normalizedP2.toLowerCase();
    }

    if (normalizedP1 === normalizedP2) {
        return true;
    }

    return path.relative(normalizedP1, normalizedP2) === '';
}

export function isInFolder(parentDir: string, checkDir: string, ignoreCase = false): boolean {
    parentDir = normalizePathToPOSIXStyle(parentDir);
    checkDir = normalizePathToPOSIXStyle(checkDir);

    if (ignoreCase || process.platform === 'win32') {
        parentDir = parentDir.toLowerCase();
        checkDir = checkDir.toLowerCase();
    }

    const checkDirRoot = normalizePathToPOSIXStyle(path.parse(checkDir).root);

    if (!checkDir || parentDir === checkDir || checkDir === checkDirRoot || path.relative(parentDir, checkDir) === '') {
        return false;
    }

    let tempCheckDir = checkDir;
    let prevTempCheckDir = '';
    while (
        tempCheckDir &&
        tempCheckDir !== checkDirRoot &&
        tempCheckDir !== prevTempCheckDir &&
        tempCheckDir !== '.' &&
        tempCheckDir !== '/'
    ) {
        prevTempCheckDir = tempCheckDir;
        tempCheckDir = normalizePathToPOSIXStyle(path.dirname(tempCheckDir));

        if (tempCheckDir === parentDir || path.relative(parentDir, tempCheckDir) === '') {
            return true;
        }
    }

    return false;
}

export async function pathExists(path: string): Promise<boolean> {
    return fs
        .access(path)
        .then(() => true)
        .catch(() => false);
}

export async function findUp(
    fileName: string,
    startDir: string | string[] | null,
    endDir: string
): Promise<string | null> {
    const startDirs: string[] = [];
    if (!startDir || (Array.isArray(startDir) && !startDir.length)) {
        startDirs.push(endDir);
    } else if (Array.isArray(startDir)) {
        startDirs.push(...startDir);
    } else {
        startDirs.push(startDir);
    }

    const rootPath = path.parse(endDir).root;

    for (let currentDir of startDirs) {
        do {
            const filePath = path.resolve(currentDir, fileName);
            if (await pathExists(filePath)) {
                return filePath;
            }
            currentDir = path.dirname(currentDir);
        } while (
            currentDir &&
            currentDir !== rootPath &&
            (isSamePaths(endDir, currentDir) || isInFolder(endDir, currentDir))
        );
    }

    return null;
}

export interface AbsolutePathInfo {
    readonly path: string;
    readonly isSystemRoot: boolean;
    readonly isFile: boolean | null;
    readonly isDirectory: boolean | null;
    readonly isSymbolicLink: boolean | null;
}

export async function getAbsolutePathInfoes(
    globPatternsOrRelativePaths: string[],
    cwd: string
): Promise<AbsolutePathInfo[]> {
    if (!globPatternsOrRelativePaths.length) {
        return [];
    }

    const pathInfoes: AbsolutePathInfo[] = [];

    for (const pathOrPattern of globPatternsOrRelativePaths) {
        if (!pathOrPattern.trim().length) {
            continue;
        }

        let normalizedPathOrPattern = normalizePathToPOSIXStyle(pathOrPattern);

        if (!normalizedPathOrPattern && /^[./\\]/.test(pathOrPattern)) {
            normalizedPathOrPattern = './';
        }

        if (!normalizedPathOrPattern) {
            continue;
        }

        if (glob.hasMagic(normalizedPathOrPattern)) {
            const foundPaths = await glob(normalizedPathOrPattern, { cwd, dot: true, absolute: true });
            for (const absolutePath of foundPaths) {
                if (pathInfoes.find((i) => i.path === absolutePath)) {
                    continue;
                }

                const isSystemRoot = isSamePaths(path.parse(absolutePath).root, absolutePath);
                let isDirectory: boolean | null = isSystemRoot ? true : null;
                let isFile: boolean | null = isSystemRoot ? false : null;
                let isSymbolicLink: boolean | null = null;
                if (!isSystemRoot) {
                    const stats = await fs.stat(absolutePath);
                    isDirectory = stats.isDirectory();
                    isFile = !isDirectory && stats.isFile();
                    isSymbolicLink = stats.isSymbolicLink();
                }

                pathInfoes.push({
                    path: absolutePath,
                    isSystemRoot,
                    isDirectory,
                    isFile,
                    isSymbolicLink
                });
            }
        } else {
            // We allow absolute path on Windows only.
            const absolutePath =
                isWindowsStyleAbsolute(normalizedPathOrPattern) && process.platform === 'win32'
                    ? path.resolve(normalizePathToPOSIXStyle(normalizedPathOrPattern))
                    : path.resolve(cwd, normalizePathToPOSIXStyle(normalizedPathOrPattern));
            if (pathInfoes.find((i) => i.path === absolutePath)) {
                continue;
            }

            const isSystemRoot = isSamePaths(path.parse(absolutePath).root, absolutePath);
            let isDirectory: boolean | null = isSystemRoot ? true : null;
            let isFile: boolean | null = isSystemRoot ? false : null;
            let isSymbolicLink: boolean | null = null;

            if (!isSystemRoot && (await pathExists(absolutePath))) {
                const stats = await fs.stat(absolutePath);
                isDirectory = stats.isDirectory();
                isFile = !isDirectory && stats.isFile();
                isSymbolicLink = stats.isSymbolicLink();
            }

            pathInfoes.push({
                path: absolutePath,
                isSystemRoot,
                isDirectory,
                isFile,
                isSymbolicLink
            });
        }
    }

    return pathInfoes;
}
