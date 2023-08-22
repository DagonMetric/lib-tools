import { BuildCommandOptions } from './build-command-options.js';

export interface ParsedBuildCommandOptions extends BuildCommandOptions {
    _env: Record<string, boolean>;

    _config: string | null;

    _projects: string[] | null;

    _outputPath: string | null;

    _cleanPaths: string[] | null;

    _copyEntries: string[] | null;

    _styleEntries: string[] | null;

    _scriptEntries: string[] | null;
}
