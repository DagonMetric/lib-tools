import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { readLibConfigJsonFile } from '../src/handlers/internals/read-lib-config-json-file.js';

void describe('handlers/internals/read-lib-config-json-file', () => {
    void describe('readLibConfigJsonFile', () => {
        void it('should read libconfig.json file', async () => {
            const libConfig = await readLibConfigJsonFile(path.resolve(process.cwd(), 'libconfig.json'));
            assert.ok(libConfig);
        });
    });
});
