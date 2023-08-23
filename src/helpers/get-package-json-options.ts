import * as path from 'node:path';

import { ParsedPackageJsonOptions } from '../models/index.js';
import { findUp, isSamePaths, isInFolder } from '../utils/index.js';

import { readPackageJsonFile } from './read-package-json-file.js';

const versionPlaceholderRegex = /0\.0\.0-PLACEHOLDER/i;

export async function getPackageJsonOptions(config: {
    projectRoot: string;
    workspaceRoot: string;
    outputPath: string;
    versionToOverride: string | undefined;
}): Promise<ParsedPackageJsonOptions | null> {
    const { projectRoot, workspaceRoot, outputPath, versionToOverride } = config;

    const packageJsonPath = await findUp('package.json', projectRoot, workspaceRoot);
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
    let packageScope: string | null = null;

    if (slashIndex > -1 && packageName.startsWith('@')) {
        packageScope = packageName.substr(0, slashIndex);
        packageNameWithoutScope = packageName.substr(slashIndex + 1);
    }

    let rootPackageJsonPath: string | null = null;
    let rootPackageJson: Record<string, unknown> | null = null;

    if (!isSamePaths(path.dirname(packageJsonPath), workspaceRoot) && isInFolder(workspaceRoot, packageJsonPath)) {
        rootPackageJsonPath = await findUp('package.json', null, workspaceRoot);
        rootPackageJson = rootPackageJsonPath ? await readPackageJsonFile(rootPackageJsonPath) : null;
    }

    let packageVersion: string | null = null;
    let nestedPackage = false;

    if (versionToOverride) {
        packageVersion = versionToOverride;
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
        packageJsonOutDir = path.resolve(outputPath, nestedPath);
    } else {
        packageJsonOutDir = outputPath;
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
