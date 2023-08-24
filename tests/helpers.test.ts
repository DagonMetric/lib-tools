import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import * as path from 'node:path';

import { InvalidConfigError } from '../src/exceptions/index.js';
import { BuildCommandOptions, BuildTaskConfig, ProjectConfig } from '../src/models/index.js';

import { applyEnvOverrides } from '../src/helpers/apply-env-overrides.js';
import { applyProjectExtends } from '../src/helpers/apply-project-extends.js';
import {
    getParsedBuildCommandOptions,
    ParsedBuildCommandOptions
} from '../src/helpers/parsed-build-command-options.js';

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

        void it('should throw if cross extends found', () => {
            const projects: Record<string, ProjectConfig> = {
                a: {
                    extends: 'c',
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

            const expectedError = new InvalidConfigError('Cross referencing extend founds.', 'projects[c].extends');

            assert.throws(() => applyProjectExtends('c', projectC, projects), expectedError);
        });

        void it('should throw if no base project to extend', () => {
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
                    extends: 'c',
                    tasks: {
                        build: {
                            clean: false,
                            style: ['a.css']
                        }
                    }
                }
            };

            const projectB = projects.b;

            assert.throws(
                () => applyProjectExtends('b', projectB, projects),
                'Invalid configuration. No base project to extends. Config location: projects[b].extends'
            );
        });
    });

    void describe('getParsedBuildCommandOptions', () => {
        void it('should parse command options', () => {
            const cmdOptions: BuildCommandOptions = {
                version: '1.0.0',
                libconfig: './libconfig.json',
                outputPath: 'dist',
                env: 'prod,ci',
                project: 'a,b,c',
                copy: 'a.txt,**/*.md',
                style: 'a.css,b.scss',
                script: 'a.js,b.ts'
            };

            const result = getParsedBuildCommandOptions(cmdOptions);
            const actual = JSON.parse(JSON.stringify(result)) as ParsedBuildCommandOptions;

            const expected: ParsedBuildCommandOptions = {
                ...cmdOptions,
                _configPath: path.resolve(process.cwd(), 'libconfig.json'),
                _outputPath: path.resolve(process.cwd(), 'dist'),
                _env: { prod: true, ci: true },
                _projects: ['a', 'b', 'c'],
                _copyEntries: ['a.txt', '**/*.md'],
                _styleEntries: ['a.css', 'b.scss'],
                _scriptEntries: ['a.js', 'b.ts']
            };

            assert.deepStrictEqual(actual, expected);
        });
    });
});
