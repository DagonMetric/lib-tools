import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(__dirname, '../dist');
const distStartRegExp = /^\.?\/?dist\//;

const copyFiles = async () => {
    try {
        await fs.access(path.resolve(distDir, 'bin'));
    } catch (err) {
        await fs.mkdir(path.resolve(distDir, 'bin'), {
            mode: 0o777,
            recursive: true
        });
    }

    // copy files
    await fs.copyFile(path.resolve(rootDir, 'bin/lib.js'), path.resolve(distDir, 'bin/lib.js'));

    // package.json
    const content = await fs.readFile(path.resolve(__dirname, '../package.json'), { encoding: 'utf-8' });

    const packageJson = JSON.parse(content);
    if (packageJson.main) {
        packageJson.main = packageJson.main.replace(distStartRegExp, './');
    }
    if (packageJson.types) {
        packageJson.types = packageJson.types.replace(distStartRegExp, './');
    }
    if (packageJson.exports) {
        packageJson.exports['.'].import = packageJson.exports['.'].import.replace(distStartRegExp, './');
        packageJson.exports['.'].types = packageJson.exports['.'].types.replace(distStartRegExp, './');
    }
    if (packageJson.devDependencies) {
        delete packageJson.devDependencies;
    }
    if (packageJson.scripts) {
        delete packageJson.scripts;
    }

    await fs.writeFile(path.resolve(distDir, 'package.json'), JSON.stringify(packageJson, null, 2));
};

await copyFiles();
