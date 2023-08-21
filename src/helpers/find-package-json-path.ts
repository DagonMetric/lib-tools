import * as path from 'node:path';

import { findUp, pathExists } from '../utils/index.js';

const cache = new Map<string, string>();

export async function findPackageJsonPath(projectRoot: string | null, workspaceRoot: string): Promise<string | null> {
    if (projectRoot) {
        const cachedPath = cache.get(projectRoot);
        if (cachedPath) {
            return cachedPath;
        }

        const foundPackageJsonPath = await findUp('package.json', projectRoot, workspaceRoot);
        if (foundPackageJsonPath) {
            cache.set(projectRoot, foundPackageJsonPath);
        }

        return foundPackageJsonPath;
    } else {
        const cachedPath = cache.get(workspaceRoot);
        if (cachedPath) {
            return cachedPath;
        }

        const rootPackageJsonPath = path.resolve(workspaceRoot, 'package.json');
        if (await pathExists(rootPackageJsonPath)) {
            cache.set(workspaceRoot, rootPackageJsonPath);
        }

        return rootPackageJsonPath;
    }
}