import { BuildTaskConfig } from './build-task-config.js';

import { ParsedPackageJsonOptions } from './parsed-build-task-package-json-options.js';

export interface ParsedBuildTaskConfig extends BuildTaskConfig {
    _workspaceRoot: string;
    _projectRoot: string;
    _outputPath: string;
    _projectName: string | null;
    _configPath: string | null;

    // package.json
    _packageJsonOptions: ParsedPackageJsonOptions | null;

    // Banner
    _bannerText: string | null;
}
