import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { readLibConfigJsonFile } from '../src/config-helpers/read-lib-config-json-file.js';

void describe('config-helpers/readLibConfigJsonFile', () => {
    void it('should read libconfig.json file', async () => {
        const libConfig = await readLibConfigJsonFile(path.resolve(process.cwd(), 'tests/test-data/libconfig.json'));
        assert.ok(libConfig);
    });
});