import * as path from 'node:path';

import { BuildCommandOptions, ParsedPackageJson } from '../models/index.js';
import { isSamePaths, isInFolder } from '../utils/index.js';

import { findPackageJsonPath } from './find-package-json-path.js';

import { readPackageJsonFile } from './read-package-json-file.js';

const versionPlaceholderRegex = /0\.0\.0-PLACEHOLDER/i;

export async function parsePackageJson(
    buildCommandOptions: BuildCommandOptions,
    projectRoot: string | null,
    workspaceRoot: string,
    outputPathAbs: string
): Promise<ParsedPackageJson | null> {
    const packageJsonPath = await findPackageJsonPath(projectRoot, workspaceRoot);
    if (!packageJsonPath) {
        return null;
    }

    const packageJson = await readPackageJsonFile(packageJsonPath);

    const packageName = packageJson.name as string;

    if (!packageName) {
        return null;
    }

    if (packageJson.private) {
        return null;
    }

    let packageNameWithoutScope = packageName;

    const slashIndex = packageName.indexOf('/');
    let packageScope: string | undefined;

    if (slashIndex > -1 && packageName.startsWith('@')) {
        packageScope = packageName.substr(0, slashIndex);
        packageNameWithoutScope = packageName.substr(slashIndex + 1);
    }

    let rootPackageJsonPath: string | undefined;
    let rootPackageJson: Record<string, unknown> | undefined;

    if (!isSamePaths(path.dirname(packageJsonPath), workspaceRoot) && isInFolder(workspaceRoot, packageJsonPath)) {
        const rootPackageJsonPath = await findPackageJsonPath(null, workspaceRoot);
        rootPackageJson = rootPackageJsonPath ? await readPackageJsonFile(rootPackageJsonPath) : undefined;
    }

    let packageVersion: string | undefined;
    let nestedPackage = false;

    if (buildCommandOptions.version) {
        packageVersion = buildCommandOptions.version;
    } else {
        if (
            !packageJson.version ||
            packageJson.version === '0.0.0' ||
            packageJson.version === '[PLACEHOLDER]' ||
            (packageJson.version && versionPlaceholderRegex.test(packageJson.version as string))
        ) {
            if (rootPackageJson?.version) {
                packageVersion = rootPackageJson.version as string;
            }
        } else if (packageJson?.version) {
            packageVersion = packageJson.version as string;
        }
    }

    if (packageName.split('/').length > 2 || (!packageName.startsWith('@') && packageName.split('/').length >= 2)) {
        nestedPackage = true;
    }

    let packageJsonOutDir: string;
    if (nestedPackage) {
        const nestedPath = packageNameWithoutScope.substr(packageNameWithoutScope.indexOf('/') + 1);
        packageJsonOutDir = path.resolve(outputPathAbs, nestedPath);
    } else {
        packageJsonOutDir = outputPathAbs;
    }

    return {
        _packageJsonOutDir: packageJsonOutDir,
        _packageJsonPath: packageJsonPath,
        _packageJson: packageJson,
        _packageName: packageName,
        _packageNameWithoutScope: packageNameWithoutScope,
        _packageScope: packageScope,
        _packageVersion: packageVersion,
        _nestedPackage: nestedPackage,
        _rootPackageJsonPath: rootPackageJsonPath,
        _rootPackageJson: rootPackageJson
    };
}
