/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */

import { glob } from 'glob';

import { Stats } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface AbsolutePathInfo {
    readonly path: string;
    readonly isSystemRoot: boolean;
    readonly isFile: boolean | null;
    readonly isDirectory: boolean | null;
    readonly isSymbolicLink: boolean | null;
}

const normalizePathToPOSIXStyleCache = new Map<string, string>();
const pathExistsCache = new Map<string, boolean>();
const findUpCache = new Map<string, string>();
const globSearchCache = new Map<string, string[]>();
const fsStatCache = new Map<string, Stats>();
const getAbsolutePathInfoesCache = new Map<string, AbsolutePathInfo[]>();

async function globSearch(normalizedPathOrPattern: string, cwd: string, useCache = false): Promise<string[]> {
    const cacheKey = `${cwd}!${normalizedPathOrPattern}`;
    if (useCache) {
        const cached = globSearchCache.get(cacheKey);
        if (cached) {
            return JSON.parse(JSON.stringify(cached)) as string[];
        }
    }

    const foundPaths = await glob(normalizedPathOrPattern, { cwd, dot: true, absolute: true });
    globSearchCache.set(cacheKey, foundPaths);

    return foundPaths;
}

async function getStats(absolutePath: string, useCache = false): Promise<Stats> {
    if (useCache) {
        const cached = fsStatCache.get(absolutePath);
        if (cached) {
            return cached;
        }
    }

    const stats = await fs.stat(absolutePath);

    fsStatCache.set(absolutePath, stats);

    return stats;
}

export function normalizePathToPOSIXStyle(p: string): string {
    if (!p?.trim().length) {
        return '';
    }

    p = p.trim();

    const cacheKey = p;
    const cached = normalizePathToPOSIXStyleCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const backToForwardSlash: [RegExp, string] = [/\\/g, '/'];

    const replaces: [RegExp, string][] = [
        [/^\.\//, ''],
        [/\/$/, ''],
        [/^\.$/, '']
    ];

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

    normalizePathToPOSIXStyleCache.set(cacheKey, p);

    return p;
}

export function isWindowsStyleAbsolute(p: string): boolean {
    if (!p) {
        return false;
    }

    p = normalizePathToPOSIXStyle(p);

    return path.win32.isAbsolute(p);
}

export function isSamePath(p1: string, p2: string, ignoreCase = false): boolean {
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

export function isInFolder(parentDir: string, checkPath: string, ignoreCase = false): boolean {
    parentDir = normalizePathToPOSIXStyle(parentDir);
    checkPath = normalizePathToPOSIXStyle(checkPath);

    if (ignoreCase || process.platform === 'win32') {
        parentDir = parentDir.toLowerCase();
        checkPath = checkPath.toLowerCase();
    }

    const checkPathRoot = normalizePathToPOSIXStyle(path.parse(checkPath).root);

    if (
        !checkPath ||
        parentDir === checkPath ||
        checkPath === checkPathRoot ||
        path.relative(parentDir, checkPath) === ''
    ) {
        return false;
    }

    let tempCheckPath = checkPath;
    let prevTempCheckPath = '';
    while (
        tempCheckPath &&
        tempCheckPath !== checkPathRoot &&
        tempCheckPath !== prevTempCheckPath &&
        tempCheckPath !== '.' &&
        tempCheckPath !== '/'
    ) {
        prevTempCheckPath = tempCheckPath;
        tempCheckPath = normalizePathToPOSIXStyle(path.dirname(tempCheckPath));

        if (tempCheckPath === parentDir || path.relative(parentDir, tempCheckPath) === '') {
            return true;
        }
    }

    return false;
}

export function resolvePath(rootPath: string, currentPath: string): string {
    return process.platform === 'win32' && isWindowsStyleAbsolute(currentPath)
        ? path.resolve(normalizePathToPOSIXStyle(currentPath))
        : path.resolve(rootPath, normalizePathToPOSIXStyle(currentPath));
}

export async function pathExists(p: string, useCache = false): Promise<boolean> {
    if (useCache) {
        const cached = pathExistsCache.get(p);
        if (cached != null) {
            return cached;
        }
    }

    return fs
        .access(p)
        .then(() => {
            pathExistsCache.set(p, true);

            return true;
        })
        .catch(() => {
            pathExistsCache.set(p, false);

            return false;
        });
}

export async function findUp(
    pathToFind: string,
    startDir: string | string[] | null,
    endDir: string,
    useCache = false
): Promise<string | null> {
    const startDirs: string[] = [];
    if (!startDir || (Array.isArray(startDir) && !startDir.length)) {
        startDirs.push(endDir);
    } else if (Array.isArray(startDir)) {
        startDir.forEach((p) => {
            if (!startDirs.includes(p)) {
                startDirs.push(p);
            }
        });
    } else {
        startDirs.push(startDir);
    }

    const cacheKey = `${pathToFind}!${startDirs.join('!')}!${endDir}`;
    if (useCache) {
        const cached = findUpCache.get(cacheKey);
        if (cached !== undefined) {
            return cached.length ? cached : null;
        }
    }

    const rootPath = path.parse(endDir).root;

    for (let currentDir of startDirs) {
        do {
            const filePath = resolvePath(currentDir, pathToFind);
            if (await pathExists(filePath, useCache)) {
                findUpCache.set(cacheKey, filePath);

                return filePath;
            }

            currentDir = path.dirname(currentDir);
        } while (
            currentDir &&
            currentDir !== rootPath &&
            (isSamePath(endDir, currentDir) || isInFolder(endDir, currentDir))
        );
    }

    findUpCache.set(cacheKey, '');

    return null;
}

// TODO:
export function getRootBasePath(paths: readonly string[]): string | null {
    if (!paths.length) {
        return null;
    }

    if (paths.length === 1) {
        return paths[0];
    }

    const firstItemRoot = path.parse(path.resolve(paths[0])).root;

    const allPathsAreEquals = (checkPaths: string[]): boolean => checkPaths.every((p) => p === checkPaths[0]);
    const allPathsAreValid = (checkPaths: string[]): boolean =>
        checkPaths.every((p) => p && p !== firstItemRoot && p !== path.parse(p).root);

    let checkPaths = paths.map((p) => path.resolve(p));

    if (!allPathsAreValid(checkPaths)) {
        return null;
    }

    do {
        if (allPathsAreEquals(checkPaths)) {
            return checkPaths[0];
        }

        checkPaths = checkPaths.map((p) => path.dirname(p));
    } while (allPathsAreValid(checkPaths));

    throw new Error('TODO: getRootBasePath');
}

export async function getAbsolutePathInfoes(
    globPatternsOrRelativePaths: string[],
    cwd: string,
    useCache = false
): Promise<AbsolutePathInfo[]> {
    if (!globPatternsOrRelativePaths.length) {
        return [];
    }

    const cacheKey = `${cwd}!${globPatternsOrRelativePaths.join('!')}`;
    if (useCache) {
        const cached = getAbsolutePathInfoesCache.get(cacheKey);
        if (cached) {
            return JSON.parse(JSON.stringify(cached)) as AbsolutePathInfo[];
        }
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
            const foundPaths = await globSearch(normalizedPathOrPattern, cwd, useCache);

            for (const absolutePath of foundPaths) {
                if (pathInfoes.some((i) => i.path === absolutePath)) {
                    continue;
                }

                const isSystemRoot = isSamePath(path.parse(absolutePath).root, absolutePath);
                let isDirectory: boolean | null = isSystemRoot ? true : null;
                let isFile: boolean | null = isSystemRoot ? false : null;
                let isSymbolicLink: boolean | null = null;
                if (!isSystemRoot) {
                    const stats = await getStats(absolutePath, useCache);
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
            const absolutePath = resolvePath(cwd, normalizedPathOrPattern);
            if (pathInfoes.some((i) => i.path === absolutePath)) {
                continue;
            }

            const isSystemRoot = isSamePath(path.parse(absolutePath).root, absolutePath);
            let isDirectory: boolean | null = isSystemRoot ? true : null;
            let isFile: boolean | null = isSystemRoot ? false : null;
            let isSymbolicLink: boolean | null = null;

            if (!isSystemRoot && (await pathExists(absolutePath, useCache))) {
                const stats = await getStats(absolutePath, useCache);
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

    getAbsolutePathInfoesCache.set(cacheKey, pathInfoes);

    return pathInfoes;
}
