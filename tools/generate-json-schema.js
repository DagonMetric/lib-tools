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
            path: '../src/models/**/*.ts',
            // -f, --tsconfig
            tsconfig: path.resolve(__dirname, './tsconfig.schema.json')
            // -t, --type
            // type: 'LibConfig'
        })
        .createSchema('LibConfig');

    // Patch
    if (schema.definitions) {
        const buildTaskDef = schema.definitions.BuildTask;
        if (
            !buildTaskDef ||
            !buildTaskDef.properties?.clean ||
            !buildTaskDef.properties?.copy ||
            !buildTaskDef.properties?.style ||
            !buildTaskDef.properties?.script
        ) {
            throw new Error(`'BuildTask' config model changed.`);
        }
        buildTaskDef.anyOf = [
            {
                required: ['clean', 'copy', 'script', 'style']
            },
            { required: ['script'] },
            { required: ['style'] },
            { required: ['copy'] },
            { required: ['clean'] }
        ];

        const beforeBuildCleanOptionsDef = schema.definitions.BeforeBuildCleanOptions;
        if (
            !beforeBuildCleanOptionsDef ||
            !beforeBuildCleanOptionsDef.properties?.cleanOutDir ||
            !beforeBuildCleanOptionsDef.properties?.paths
        ) {
            throw new Error(`'BeforeBuildCleanOptions' config model changed.`);
        }
        beforeBuildCleanOptionsDef.anyOf = [
            {
                required: ['cleanOutDir', 'paths']
            },
            { required: ['cleanOutDir'] },
            { required: ['paths'] }
        ];
    }
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
