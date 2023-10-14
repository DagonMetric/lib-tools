import * as path from 'node:path';

import { PackageJsonOptions } from '../../config-models/index.js';
import { findUp, isInFolder, isSamePath, readJsonWithComments } from '../../utils/index.js';

import { BuildTask } from '../build-task.js';
import { InvalidCommandOptionError, InvalidConfigError } from '../exceptions/index.js';

const versionPlaceholderRegExp = /^0\.0\.0|0\.0\.0-PLACEHOLDER|\[VERSION\]|\[PLACEHOLDER\]$/i;
const semverionPrefixRegExp = /^((0|[1-9]\d{0,9})\.){2,2}(0|[1-9]\d{0,9})/;
const packageJsonCache = new Map<string, PackageJsonLike>();
const packageJsonInfoCache = new Map<string, PackageJsonInfo | false>();

async function readPackageJsonFile(packageJsonPath: string): Promise<PackageJsonLike | null> {
    const cached = packageJsonCache.get(packageJsonPath);
    if (cached) {
        return cached;
    }

    const data = await readJsonWithComments(packageJsonPath);

    if (!data || typeof data !== 'object' || typeof (data as Record<string, unknown>).name !== 'string') {
        return null;
    }

    const packageJson = data as PackageJsonLike;

    packageJsonCache.set(packageJsonPath, packageJson);

    return packageJson;
}

/**
 * @internal
 */
export interface PackageJsonLike {
    [key: string]: unknown;
    name: string;
}

/**
 * @internal
 */
export interface PackageJsonInfo extends Pick<PackageJsonOptions, 'removeFields' | 'updateFields'> {
    readonly packageJsonConfig: Readonly<PackageJsonLike>;
    readonly packageJsonPath: string;
    readonly packageName: string;
    readonly packageScope: string | null;
    readonly rootPackageJsonConfig: Readonly<PackageJsonLike> | null;
    readonly rootPackageJsonPath: string | null;
    readonly newPackageVersion: string | null;
}

/**
 * @internal
 */
export async function getPackageJsonInfo(buildTask: Readonly<BuildTask>): Promise<PackageJsonInfo | null> {
    if (buildTask.packageJson === false) {
        return null;
    }

    const packageJsonOptions = typeof buildTask.packageJson === 'object' ? buildTask.packageJson : {};

    const { projectRoot, workspaceRoot, projectName, configPath, taskName } = buildTask;

    const cacheKey = `${projectRoot}!${configPath ?? ''}!${JSON.stringify(packageJsonOptions)}`;
    const cached = packageJsonInfoCache.get(cacheKey);
    if (cached != null) {
        return cached === false ? null : cached;
    }

    const packageJsonPath = await findUp('package.json', projectRoot, workspaceRoot, true);
    if (!packageJsonPath) {
        packageJsonInfoCache.set(cacheKey, false);

        return null;
    }

    const packageJsonConfig = await readPackageJsonFile(packageJsonPath);
    if (!packageJsonConfig) {
        packageJsonInfoCache.set(cacheKey, false);

        return null;
    }

    const packageName = packageJsonConfig.name;

    if (packageJsonConfig.private) {
        packageJsonInfoCache.set(cacheKey, false);

        return null;
    }

    const slashIndex = packageName.indexOf('/');
    let packageScope: string | null = null;

    if (slashIndex > -1 && packageName.startsWith('@')) {
        packageScope = packageName.substring(0, slashIndex);
    }

    let rootPackageJsonConfig: PackageJsonLike | null = null;
    let rootPackageJsonPath: string | null = null;
    if (!isSamePath(path.dirname(packageJsonPath), workspaceRoot) && isInFolder(workspaceRoot, packageJsonPath)) {
        rootPackageJsonPath = await findUp('package.json', null, workspaceRoot, true);
        rootPackageJsonConfig = rootPackageJsonPath ? await readPackageJsonFile(rootPackageJsonPath) : null;
    }

    let newPackageVersion: string | null = null;

    if (packageJsonOptions.packageVersion?.trim()) {
        const packageVersionToSet = packageJsonOptions.packageVersion;
        const configLocationPrefix = projectName ? `projects/${projectName}/tasks/${taskName}` : `tasks/${taskName}`;

        if (packageVersionToSet === 'root') {
            if (
                rootPackageJsonConfig?.version == null ||
                typeof rootPackageJsonConfig.version !== 'string' ||
                !semverionPrefixRegExp.test(rootPackageJsonConfig.version)
            ) {
                const errMsg = 'Could not find valid root package.json version.';
                if (!projectName) {
                    throw new InvalidCommandOptionError('packageVersion', packageVersionToSet, errMsg);
                } else {
                    throw new InvalidConfigError(
                        errMsg,
                        configPath,
                        `${configLocationPrefix}/packageJson/packageVersion`
                    );
                }
            }

            newPackageVersion = rootPackageJsonConfig.version;
        } else {
            if (
                versionPlaceholderRegExp.test(packageVersionToSet) ||
                !semverionPrefixRegExp.test(packageVersionToSet)
            ) {
                const errMsg = 'The packageVersion is not valid semver.';
                if (!projectName) {
                    throw new InvalidCommandOptionError('packageVersion', packageVersionToSet, errMsg);
                } else {
                    throw new InvalidConfigError(
                        errMsg,
                        configPath,
                        `${configLocationPrefix}/packageJson/packageVersion`
                    );
                }
            }

            newPackageVersion = packageVersionToSet;
        }
    }

    const packageJsonInfo: PackageJsonInfo = {
        packageJsonPath,
        packageJsonConfig,
        packageName,
        packageScope,
        rootPackageJsonPath,
        rootPackageJsonConfig,
        newPackageVersion,
        updateFields: packageJsonOptions.updateFields,
        removeFields: packageJsonOptions.removeFields
    };

    packageJsonInfoCache.set(cacheKey, packageJsonInfo);

    return packageJsonInfo;
}
