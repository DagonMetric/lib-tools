#!/usr/bin/env node

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const thisPackageName = 'lib-tools';

const getCliInfo = async () => {
    let packageJsonPath = '';

    try {
        // TODO: experimental
        // import.meta.resolve(...);

        // const require = createRequire(import.meta.url);
        const require = createRequire(process.cwd() + '/');
        packageJsonPath = require.resolve(`${thisPackageName}/package.json`);
    } catch (err) {
        // console.error(err);
    }

    if (!packageJsonPath) {
        packageJsonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
    }

    const content = await fs.readFile(packageJsonPath, { encoding: 'utf-8' });
    const packageJson = JSON.parse(content);
    const version = packageJson.version;

    const cliPath = path.resolve(
        path.dirname(packageJsonPath),
        packageJson.exports?.['.']?.import ?? packageJson.module ?? packageJson.main
    );

    return {
        version,
        cliPath
    };
};

const runCli = async () => {
    const cliInfo = await getCliInfo();
    process.title = `${thisPackageName} v${cliInfo.version}`;
    const cliModule = await import(pathToFileURL(cliInfo.cliPath).toString());

    await cliModule.default({ version: cliInfo.version });
};

void runCli();
