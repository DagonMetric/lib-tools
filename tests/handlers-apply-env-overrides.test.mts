import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { BuildTaskConfig } from '../src/config-models/build-task-config.mjs';
import { CustomTaskConfig } from '../src/config-models/custom-task-config.mjs';
import { applyEnvOverrides } from '../src/handlers/internals/apply-env-overrides.mjs';

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
                handler: 'a.mjs',
                custom: 'custom-1',
                envOverrides: {
                    prod: {
                        handler: 'b.mjs',
                        skip: true,
                        custom: 'custom-2'
                    }
                }
            };

            applyEnvOverrides(config, ['prod']);

            const expectedConfig: CustomTaskConfig = {
                handler: 'b.mjs',
                custom: 'custom-2',
                skip: true,
                envOverrides: {
                    prod: {
                        handler: 'b.mjs',
                        skip: true,
                        custom: 'custom-2'
                    }
                }
            };

            assert.deepStrictEqual(config, expectedConfig);
        });
    });
});
