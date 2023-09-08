import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { applyEnvOverrides } from '../src/config-helpers/apply-env-overrides.js';

import { BuildTask, ExternalTask } from '../src/models/index.js';

void describe('config-helpers/applyEnvOverrides', () => {
    void it('should override with env value to build task', () => {
        const config: BuildTask = {
            banner: 'b1',
            clean: false,
            copy: ['a.txt', 'b.md'],
            envOverrides: {
                prod: {
                    banner: 'b2',
                    clean: true,
                    copy: ['c.md']
                }
            }
        };

        applyEnvOverrides(config, { prod: true });

        const expectedConfig: BuildTask = {
            banner: 'b2',
            clean: true,
            copy: ['c.md'],
            envOverrides: {
                prod: {
                    banner: 'b2',
                    clean: true,
                    copy: ['c.md']
                }
            }
        };

        assert.deepStrictEqual(config, expectedConfig);
    });

    void it('should override with env value to external task', () => {
        const config: ExternalTask = {
            handler: 'a.js',
            envOverrides: {
                prod: {
                    handler: 'b.js',
                    skip: true
                }
            }
        };

        applyEnvOverrides(config, { prod: true });

        const expectedConfig: BuildTask = {
            handler: 'b.js',
            skip: true,
            envOverrides: {
                prod: {
                    handler: 'b.js',
                    skip: true
                }
            }
        };

        assert.deepStrictEqual(config, expectedConfig);
    });
});
