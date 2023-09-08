import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { dashCaseToCamelCase } from '../src/utils/dash-case-to-camel-case.js';

void describe('utils/dash-case-to-camel-case', () => {
    void describe('dashCaseToCamelCase', () => {
        void it('should convert to camel case', () => {
            const result = dashCaseToCamelCase('dash-case-to-camel-case');
            assert.strictEqual(result, 'dashCaseToCamelCase');
        });
    });
});
