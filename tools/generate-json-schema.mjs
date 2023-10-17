import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const defaultSchemaOutFilePath = path.resolve(thisDir, '../dist/schemas/schema.json');
const defaultTsConfigPath = path.resolve(thisDir, './tsconfig.schema.json');
const defaultSchemaId = 'lib-tools://schemas/schema.json';
const defaultTypeName = 'LibConfig';

/**
 * @param {{[key: string]: unknown}} [task]
 * @param {{logger?: { info: (message: string) => void}}} [options]
 */
export async function generateJsonSchema(task, options) {
    const { projectRoot, outFile, schemaId, tsconfig, typeName } = task ?? {};
    const { logger } = options ?? {};

    logger?.info('Generating json schema from typescript files...');

    const schema = createGenerator({
        // -i, --id
        schemaId: schemaId ?? defaultSchemaId,
        // -p, --path
        // path: '../src/config-models/**/*.mts'
        // -f, --tsconfig
        tsconfig: tsconfig ? path.resolve(projectRoot, tsconfig) : defaultTsConfigPath
        // -t, --type
        // type: '*'
    }).createSchema(typeName ?? defaultTypeName);

    const schemaString = JSON.stringify(schema, null, 2);

    logger?.info('Success.');

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
