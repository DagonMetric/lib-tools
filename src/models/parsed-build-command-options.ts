import { BuildCommandOptions } from './build-command-options.js';

export interface ParsedBuildCommandOptions extends BuildCommandOptions {
    _env: Record<string, boolean>;

    _projects: string[];

    _configPath: string | null;

    _outputPath: string | null;

    _copyEntries: string[];

    _styleEntries: string[];

    _scriptEntries: string[];
}
