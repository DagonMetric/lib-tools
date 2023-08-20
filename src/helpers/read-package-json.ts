import * as fs from 'node:fs/promises';

const cache = new Map<string, Record<string, unknown>>();

export async function readPackageJson(packageJsonPath: string): Promise<Record<string, unknown>> {
    const cachedPackageJson = cache.get(packageJsonPath);
    if (cachedPackageJson) {
        return cachedPackageJson;
    }

    const content = await fs.readFile(packageJsonPath, { encoding: 'utf8' });

    const packageJson = JSON.parse(content) as Record<string, unknown>;
    cache.set(packageJsonPath, packageJson);

    return packageJson;
}
