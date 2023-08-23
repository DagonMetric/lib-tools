import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { BuildTaskConfig, ProjectConfig } from '../src/models/index.js';

import { applyEnvOverrides } from '../src/helpers/apply-env-overrides.js';
import { applyProjectExtends } from '../src/helpers/apply-project-extends.js';

void describe('Helpers', () => {
    void describe('applyEnvOverrides', () => {
        void it('should override with env', () => {
            const config: BuildTaskConfig = {
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

            const expectedConfig: BuildTaskConfig = {
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
    });

    void describe('applyProjectExtends', () => {
        void it('should extend', () => {
            const projects: Record<string, ProjectConfig> = {
                a: {
                    tasks: {
                        build: {
                            banner: 'a',
                            clean: true,
                            copy: ['a.txt', 'b.txt']
                        }
                    }
                },
                b: {
                    extends: 'a',
                    tasks: {
                        build: {
                            clean: false,
                            style: ['a.css']
                        }
                    }
                },
                c: {
                    extends: 'b',
                    tasks: {
                        build: {
                            banner: 'c',
                            script: ['a.js']
                        }
                    }
                }
            };

            const projectC = projects.c;

            applyProjectExtends('c', projectC, projects);

            const expectedConfig = {
                extends: 'b',
                tasks: {
                    build: {
                        banner: 'c',
                        clean: false,
                        copy: ['a.txt', 'b.txt'],
                        style: ['a.css'],
                        script: ['a.js']
                    }
                }
            };

            assert.deepStrictEqual(projectC, expectedConfig);
        });
    });
});
