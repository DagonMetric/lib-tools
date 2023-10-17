import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { dashToCamelCase } from '../src/utils/dash-to-camel-case.mjs';

void describe('utils/dash-to-camel-case', () => {
    void describe('dashToCamelCase', () => {
        void it('should convert to camel case', () => {
            const result = dashToCamelCase('dash-to-camel-case');
            assert.strictEqual(result, 'dashToCamelCase');
        });
    });
});
