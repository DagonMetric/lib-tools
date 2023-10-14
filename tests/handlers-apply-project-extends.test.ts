import * as assert from 'node:assert';
import { describe, it } from 'node:test';

import { BuildTaskConfig, CustomTaskConfig, ProjectConfig } from '../src/config-models/internals/index.js';
import { InvalidConfigError } from '../src/handlers/exceptions/index.js';
import { applyProjectExtends } from '../src/handlers/internals/apply-project-extends.js';

void describe('handlers/internals/apply-project-extends', () => {
    void describe('applyProjectExtends', () => {
        void it('should extend', () => {
            const buildTaskProjectA: BuildTaskConfig = {
                clean: true,
                copy: ['a.txt', 'b.txt']
            };

            const buildTaskProjectB: BuildTaskConfig = {
                clean: false,
                style: ['a.css']
            };

            const buildTaskProjectC: BuildTaskConfig = {
                script: ['a.js']
            };

            const projects: (ProjectConfig & { name: string })[] = [
                {
                    name: 'a',
                    root: './package-a',
                    tasks: {
                        build: buildTaskProjectA,
                        lint: {
                            handler: './handler.mjs',
                            config: '.eslintrc.json'
                        }
                    } as unknown as Record<string, CustomTaskConfig & BuildTaskConfig>
                },
                {
                    name: 'b',
                    extends: 'a',
                    tasks: {
                        build: buildTaskProjectB,
                        test: {
                            handler: './handler.mjs'
                        }
                    } as unknown as Record<string, CustomTaskConfig & BuildTaskConfig>
                },
                {
                    name: 'c',
                    extends: 'b',
                    tasks: {
                        build: buildTaskProjectC
                    } as unknown as Record<string, CustomTaskConfig & BuildTaskConfig>
                }
            ];

            const projectC = projects[2];
            applyProjectExtends(projectC, projects, null);

            const expectedProjectConfig: ProjectConfig & { name: string } = {
                name: 'c',
                extends: 'b',
                root: './package-a',
                tasks: {
                    build: {
                        ...buildTaskProjectA,
                        ...buildTaskProjectB,
                        ...buildTaskProjectC
                    },
                    lint: {
                        handler: './handler.mjs',
                        config: '.eslintrc.json'
                    },
                    test: {
                        handler: './handler.mjs'
                    }
                } as unknown as Record<string, CustomTaskConfig & BuildTaskConfig>
            };

            assert.deepStrictEqual(projectC, expectedProjectConfig);
        });

        void it('should throw if cross extends found', () => {
            const projects: (ProjectConfig & { name: string })[] = [
                {
                    name: 'a',
                    extends: 'c',
                    root: './package-a',
                    tasks: {
                        lint: {}
                    } as unknown as Record<string, CustomTaskConfig & BuildTaskConfig>
                },
                {
                    name: 'b',
                    extends: 'a',
                    tasks: {
                        test: {}
                    } as unknown as Record<string, CustomTaskConfig & BuildTaskConfig>
                },
                {
                    name: 'c',
                    extends: 'b',
                    tasks: {}
                }
            ];

            const projectC = projects[2];

            const expectedError = new InvalidConfigError(
                'Cross referencing extend occours.',
                null,
                'projects/c/extends'
            );

            assert.throws(() => applyProjectExtends(projectC, projects, null), expectedError);
        });

        void it('should throw if no base project to extend', () => {
            const projects: (ProjectConfig & { name: string })[] = [
                {
                    name: 'a',
                    extends: 'c',
                    root: './package-a',
                    tasks: {
                        lint: {}
                    } as unknown as Record<string, CustomTaskConfig & BuildTaskConfig>
                },
                {
                    name: 'b',
                    extends: 'a',
                    tasks: {
                        test: {}
                    } as unknown as Record<string, CustomTaskConfig & BuildTaskConfig>
                },
                {
                    name: 'c',
                    extends: 'd',
                    tasks: {}
                }
            ];

            const projectC = projects[2];

            assert.throws(() => applyProjectExtends(projectC, projects, null), {
                message: 'Configuration error: No base project to extend.\n  config location: projects/b/extends'
            });
        });
    });
});
