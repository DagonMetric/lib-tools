import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

const copyBin = async () => {
    await fs.mkdir(path.resolve(distDir, 'bin'), {
        mode: 0o777,
        recursive: true
    });

    // copy files
    await fs.copyFile(path.resolve(rootDir, 'bin/lib.mjs'), path.resolve(distDir, 'bin/lib.mjs'));

    // package.json
    // const content = await fs.readFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), {
    //     encoding: 'utf-8'
    // });

    // const distStartRegExp = /^\.?\/?dist\//;
    // const packageJson = JSON.parse(content);
    // if (packageJson.main) {
    //     packageJson.main = packageJson.main.replace(distStartRegExp, './');
    // }
    // if (packageJson.module) {
    //     packageJson.module = packageJson.module.replace(distStartRegExp, './');
    // }
    // if (packageJson.types) {
    //     packageJson.types = packageJson.types.replace(distStartRegExp, './');
    // }
    // if (packageJson.exports) {
    //     packageJson.exports['.'].import = packageJson.exports['.'].import.replace(distStartRegExp, './');
    //     packageJson.exports['.'].types = packageJson.exports['.'].types.replace(distStartRegExp, './');
    // }
    // if (packageJson.devDependencies) {
    //     delete packageJson.devDependencies;
    // }
    // if (packageJson.scripts) {
    //     delete packageJson.scripts;
    // }

    // await fs.writeFile(path.resolve(distDir, 'package.json'), JSON.stringify(packageJson, null, 2));
};

await copyBin();