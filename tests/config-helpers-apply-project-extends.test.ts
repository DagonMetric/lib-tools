import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { applyProjectExtends } from '../src/config-helpers/apply-project-extends.js';

import { BuildTask, CustomTask, Project } from '../src/config-models/index.js';
import { InvalidConfigError } from '../src/exceptions/index.js';

void describe('config-helpers/apply-project-extends', () => {
    void describe('applyProjectExtends', () => {
        void it('should extend', () => {
            const projects: Record<string, Project> = {
                a: {
                    root: './package-a',
                    tasks: {
                        build: {
                            banner: 'a',
                            clean: true,
                            copy: ['a.txt', 'b.txt']
                        },
                        lint: {
                            handler: './handler.mjs',
                            options: {
                                config: '.eslintrc.json'
                            }
                        }
                    } as unknown as Record<string, CustomTask & BuildTask>
                },
                b: {
                    extends: 'a',
                    tasks: {
                        build: {
                            clean: false,
                            style: ['a.css']
                        },
                        test: {
                            handler: './handler.mjs'
                        }
                    } as unknown as Record<string, CustomTask & BuildTask>
                },
                c: {
                    extends: 'b',
                    tasks: {
                        build: {
                            banner: 'c',
                            script: ['a.js']
                        }
                    } as unknown as Record<string, CustomTask & BuildTask>
                }
            };

            const projectC = projects.c;

            applyProjectExtends('c', projectC, projects, null);

            const expectedConfig: Project = {
                extends: 'b',
                root: './package-a',
                tasks: {
                    build: {
                        banner: 'c',
                        clean: false,
                        copy: ['a.txt', 'b.txt'],
                        style: ['a.css'],
                        script: ['a.js']
                    },
                    lint: {
                        handler: './handler.mjs',
                        options: {
                            config: '.eslintrc.json'
                        }
                    },
                    test: {
                        handler: './handler.mjs'
                    }
                } as unknown as Record<string, CustomTask & BuildTask>
            };

            assert.deepStrictEqual(projectC, expectedConfig);
        });

        void it('should throw if cross extends found', () => {
            const projects: Record<string, Project> = {
                a: {
                    extends: 'c',
                    tasks: {}
                },
                b: {
                    extends: 'a',
                    tasks: {}
                },
                c: {
                    extends: 'b',
                    tasks: {}
                }
            };

            const projectC = projects.c;

            const expectedError = new InvalidConfigError(
                'Cross referencing extend founds.',
                null,
                'projects/c/extends'
            );

            assert.throws(() => applyProjectExtends('c', projectC, projects, null), expectedError);
        });

        void it('should throw if no base project to extend', () => {
            const projects: Record<string, Project> = {
                a: {
                    tasks: {}
                },
                b: {
                    extends: 'c',
                    tasks: {}
                }
            };

            const projectB = projects.b;

            assert.throws(() => applyProjectExtends('b', projectB, projects, null), {
                message: 'Configuration error: No base project to extend.\n  config location: projects/b/extends'
            });
        });
    });
});
