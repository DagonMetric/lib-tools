#!/usr/bin/env node

import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getCliInfo = async () => {
    const packageName = 'lib-tools';
    let packageJsonPath = '';

    try {
        // TODO: experimental
        // resolvedPath = await import.meta.resolve(`${packageName}`);

        // const require = createRequire(import.meta.url);
        const require = createRequire(process.cwd() + '/');
        packageJsonPath = require.resolve(`${packageName}/package.json`);
    } catch (err) {
        // console.error(err);
    }

    if (!packageJsonPath) {
        packageJsonPath = path.resolve(__dirname, '../package.json');
    }

    const content = await fs.readFile(packageJsonPath, { encoding: 'utf-8' });
    const packageJson = JSON.parse(content);
    const version = packageJson.version;

    const cliPath = path.resolve(
        path.dirname(packageJsonPath),
        packageJson.exports?.['.']?.import ? packageJson.exports['.'].import : packageJson.main
    );

    return {
        packageName,
        version,
        cliPath
    };
};

const runCli = async () => {
    const cliInfo = await getCliInfo();
    process.title = `${cliInfo.packageName} v${cliInfo.version}`;
    const cliModule = await import(pathToFileURL(cliInfo.cliPath).toString());

    await cliModule.default(cliInfo);
};

await runCli();
