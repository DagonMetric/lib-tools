import { BuildTaskConfig } from './build-task-config.js';
import { CleanOptions } from './build-task-clean-options.js';
import { CopyEntry } from './build-task-copy-options.js';
import { ScriptOptions } from './build-task-script-options.js';
import { StyleOptions } from './build-task-style-options.js';

import { ParsedPackageJsonOptions } from './parsed-build-task-package-json-options.js';

export interface ParsedBuildTaskConfig extends BuildTaskConfig {
    _workspaceRoot: string;
    _projectName: string;
    _projectRoot: string;
    _outputPath: string;

    _config: string | null;
    _nodeModulesPath: string | null;

    _bannerText: string | null;

    // Clean
    _clean?: CleanOptions | null;

    // Copy
    _copyEntries?: CopyEntry[] | null;

    // style
    _style?: StyleOptions | null;

    // scripts
    _script?: ScriptOptions | null;

    // package.json
    _packageJson?: ParsedPackageJsonOptions | null;
}
