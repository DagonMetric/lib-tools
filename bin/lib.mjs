#!/usr/bin/env node

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const thisPackageName = 'lib-tools';

const pathExists = (p) =>
    fs
        .access(p)
        .then(() => true)
        .catch(() => false);

const getCliInfo = async () => {
    let packageJsonPath;

    try {
        // TODO: experimental
        // import.meta.resolve(...);
        const cwdRequire = createRequire(process.cwd() + '/');
        packageJsonPath = cwdRequire.resolve(`${thisPackageName}/package.json`);
    } catch (_) {}

    if (!packageJsonPath) {
        const testPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
        if (await pathExists(testPath)) {
            packageJsonPath = testPath;
        }
    }

    let cliPath;
    let cliVersion;

    if (packageJsonPath) {
        const content = await fs.readFile(packageJsonPath, { encoding: 'utf-8' });
        const packageJson = JSON.parse(content);
        const cliEntry = packageJson.exports?.['./cli']?.default;
        const testCliPath = cliEntry ? path.resolve(path.dirname(packageJsonPath), cliEntry) : undefined;

        if (packageJson.name === thisPackageName && testCliPath && (await pathExists(testCliPath))) {
            cliPath = testCliPath;
            cliVersion = packageJson.version;
        }
    }

    if (cliPath && cliVersion) {
        return {
            cliPath,
            version: cliVersion
        };
    } else {
        return {
            cliPath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../cli/index.js'),
            version: '0.0.0-dev'
        };
    }
};

const runCli = async () => {
    const cliInfo = await getCliInfo();
    process.title = `${thisPackageName} v${cliInfo.version}`;
    const cliModule = await import(pathToFileURL(cliInfo.cliPath).toString());

    await cliModule.default({ version: cliInfo.version });
};

void runCli();
