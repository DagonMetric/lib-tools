import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const defaultSchemaOutFilePath = path.resolve(thisDir, '../dist/schemas/schema.json');

/**
 * @param {{[key: string]: unknown}} [task]
 * @param {{logger?: { info: (message: string) => void}}} [options]
 */
export async function generateJsonSchema(task, options) {
    const { logger } = options ?? {};
    logger?.info('Generating json schema from typescript file...');

    const schema = createGenerator({
        // -i, --id
        schemaId: 'lib-tools://schemas/schema.json',
        // -p, --path
        // path: '../src/config-models/**/*.mts'
        // -f, --tsconfig
        tsconfig: path.resolve(thisDir, './tsconfig.schema.json')
        // -t, --type
        // type: '*'
    }).createSchema('LibConfig');

    const schemaString = JSON.stringify(schema, null, 2);

    logger?.info('Success.');

    const { projectRoot, outFile } = task ?? {};

    let schemaOutFilePath;
    if (projectRoot && outFile) {
        schemaOutFilePath = path.relative(projectRoot, outFile);
    } else {
        schemaOutFilePath = defaultSchemaOutFilePath;
    }

    logger?.info(
        `Writing schema content to ${path.relative(process.cwd(), schemaOutFilePath).replace(/\\/g, '/')} ...`
    );

    await fs.mkdir(path.dirname(schemaOutFilePath), {
        mode: 0o777,
        recursive: true
    });

    await fs.writeFile(schemaOutFilePath, schemaString, 'utf-8');

    logger?.info('Success.');
}

if (process.argv.length >= 2 && process.argv[1] === path.resolve(thisFile)) {
    await generateJsonSchema();
}
