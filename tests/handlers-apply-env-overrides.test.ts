import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { BuildTaskConfig, CustomTaskConfig } from '../src/config-models/internals/index.js';
import { applyEnvOverrides } from '../src/handlers/internals/apply-env-overrides.js';

void describe('handlers/internals/apply-env-overrides', () => {
    void describe('applyEnvOverrides', () => {
        void it('should override with env value to build task', () => {
            const config: BuildTaskConfig = {
                clean: false,
                copy: ['a.txt', 'b.md'],
                outDir: 'out',
                envOverrides: {
                    prod: {
                        clean: true,
                        copy: ['c.md'],
                        outDir: 'dist'
                    }
                }
            };

            applyEnvOverrides(config, ['prod']);

            const expectedConfig: BuildTaskConfig = {
                clean: true,
                copy: ['c.md'],
                outDir: 'dist',
                envOverrides: {
                    prod: {
                        clean: true,
                        copy: ['c.md'],
                        outDir: 'dist'
                    }
                }
            };

            assert.deepStrictEqual(config, expectedConfig);
        });

        void it('should override with env value to external task', () => {
            const config: CustomTaskConfig = {
                handler: 'a.js',
                custom: 'custom-1',
                envOverrides: {
                    prod: {
                        handler: 'b.js',
                        skip: true,
                        custom: 'custom-2'
                    }
                }
            };

            applyEnvOverrides(config, ['prod']);

            const expectedConfig: CustomTaskConfig = {
                handler: 'b.js',
                custom: 'custom-2',
                skip: true,
                envOverrides: {
                    prod: {
                        handler: 'b.js',
                        skip: true,
                        custom: 'custom-2'
                    }
                }
            };

            assert.deepStrictEqual(config, expectedConfig);
        });
    });
});
