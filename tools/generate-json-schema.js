import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as tsj from 'ts-json-schema-generator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaOutputFilePath = path.resolve(__dirname, '../dist/schemas/schema.json');

const generateJsonSchemaFile = async () => {
    const schema = tsj
        .createGenerator({
            // -i, --id
            schemaId: 'lib-tools://schemas/schema.json',
            // -p, --path
            path: '../src/config-models/**/*.ts',
            // -f, --tsconfig
            tsconfig: path.resolve(__dirname, './tsconfig.schema.json')
            // -t, --type
            // type: 'LibConfig'
        })
        .createSchema('LibConfig');

    const schemaString = JSON.stringify(schema, null, 2);

    const schemaOutputDir = path.dirname(schemaOutputFilePath);

    try {
        await fs.access(schemaOutputDir);
    } catch (err) {
        await fs.mkdir(schemaOutputDir, {
            mode: 0o777,
            recursive: true
        });
    }

    await fs.writeFile(schemaOutputFilePath, schemaString);
};

await generateJsonSchemaFile();
