#!/usr/bin/env node
/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cliName = 'lib-tools';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

const pathExists = (p: string) =>
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
        packageJsonPath = cwdRequire.resolve(`${cliName}/package.json`);
    } catch (_) {}

    if (!packageJsonPath) {
        try {
            // TODO: experimental
            // import.meta.resolve(...);
            const thisDirRequire = createRequire(thisDir + '/');
            packageJsonPath = thisDirRequire.resolve(`${cliName}/package.json`);
        } catch (_) {}
    }

    let cliPath;
    let cliVersion;

    if (packageJsonPath) {
        const content = await fs.readFile(packageJsonPath, { encoding: 'utf-8' });
        const packageJson = JSON.parse(content) as {
            version?: string;
            exports?: Record<string, { import?: string; default?: string }>;
        };
        cliVersion = packageJson.version;
        const cliExportEntry = packageJson.exports?.['./cli']?.import ?? packageJson.exports?.['./cli']?.default;
        const testCliPath = cliExportEntry ? path.resolve(path.dirname(packageJsonPath), cliExportEntry) : undefined;

        if (testCliPath && (await pathExists(testCliPath))) {
            cliPath = testCliPath;
        }
    }

    if (cliPath && cliVersion) {
        return {
            cliPath,
            cliName,
            cliVersion
        };
    } else {
        // eslint-disable-next-line no-console
        console.error('Error: Could not load lib-tools cli.');
        process.exit(1);
    }
};

const runCli = async () => {
    const cliInfo = await getCliInfo();

    const cliModule = (await import(pathToFileURL(cliInfo.cliPath).toString())) as {
        default: (options: unknown) => Promise<void>;
    };

    await cliModule.default(cliInfo);
};

void runCli();
