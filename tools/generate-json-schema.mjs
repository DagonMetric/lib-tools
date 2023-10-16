import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGenerator } from 'ts-json-schema-generator';

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const schemaOutputFilePath = path.resolve(thisDir, '../dist/schemas/schema.json');

export async function generateJsonSchemaFile() {
    const schema = createGenerator({
        // -i, --id
        schemaId: 'lib-tools://schemas/schema.json',
        // -p, --path
        // path: '../src/config-models/**/*.mts',
        // -f, --tsconfig
        tsconfig: path.resolve(thisDir, './tsconfig.schema.json')
        // -t, --type
        // type: 'LibConfig'
    }).createSchema('LibConfig');

    const schemaString = JSON.stringify(schema, null, 2);

    const schemaOutputDir = path.dirname(schemaOutputFilePath);

    await fs.mkdir(schemaOutputDir, {
        mode: 0o777,
        recursive: true
    });

    await fs.writeFile(schemaOutputFilePath, schemaString);
}

export default generateJsonSchemaFile;

if (process.argv.length >= 2 && process.argv[1] === path.resolve(thisFile)) {
    await generateJsonSchemaFile();
}
