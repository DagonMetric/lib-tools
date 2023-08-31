import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export function normalizePath(p: string): string {
    if (!p) {
        return '';
    }

    p = path
        .normalize(p)
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/(\/|\\)+$/, '');

    if (p === '.' || p === './' || p === '/') {
        return '';
    }

    return p;
}

export function isSamePaths(p1: string, p2: string): boolean {
    if (p1 === p2) {
        return true;
    }

    p1 = normalizePath(p1);
    p2 = normalizePath(p2);

    return p1.toLowerCase() === p2.toLowerCase();
}

export function isInFolder(parentDir: string, checkDir: string): boolean {
    parentDir = normalizePath(parentDir).toLowerCase();
    checkDir = normalizePath(checkDir).toLowerCase();

    if (!checkDir || parentDir === checkDir) {
        return false;
    }

    const checkDirHome = normalizePath(path.parse(checkDir).root);
    if (checkDir === checkDirHome || checkDir === checkDirHome || checkDir === '.' || checkDir === './') {
        return false;
    }

    let tempCheckDir = checkDir;
    let prevTempCheckDir = '';
    while (tempCheckDir && tempCheckDir !== checkDirHome && tempCheckDir !== '.' && tempCheckDir !== prevTempCheckDir) {
        prevTempCheckDir = tempCheckDir;
        tempCheckDir = normalizePath(path.dirname(tempCheckDir));

        if (tempCheckDir === parentDir || tempCheckDir === parentDir) {
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
