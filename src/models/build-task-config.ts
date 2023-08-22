import { OverridableTaskConfig } from './overridable-task-config.js';
import { CleanOptions } from './build-task-clean-options.js';
import { CopyEntry } from './build-task-copy-options.js';
import { PackageJsonOptions } from './build-task-package-json-options.js';
import { ScriptOptions } from './build-task-script-options.js';
import { StyleOptions } from './build-task-style-options.js';

/**
 * @additionalProperties false
 */
export interface BuildTaskConfigBase {
    /**
     * The output directory for build results.
     */
    outputPath?: string;

    /**
     * Banner text to add at the top of each generated files. It can be file path or raw text.
     */
    banner?: string;

    /**
     * Clean options for deleting build output files and directories.
     */
    clean?: boolean | string[] | CleanOptions;

    /**
     * List of assets to copy to output directory.
     */
    copy?: (string | CopyEntry)[];

    /**
     * Style compilation / bundling options.
     */
    style?: string[] | StyleOptions;

    /**
     * Script compilation / bundle options.
     */
    script?: string[] | ScriptOptions;

    /**
     * Options for updating package.json file.
     */
    packageJson?: PackageJsonOptions | boolean;
}

/**
 * The build task.
 * @additionalProperties false
 */
export interface BuildTaskConfig extends BuildTaskConfigBase, OverridableTaskConfig<BuildTaskConfigBase> {
    /**
     * Set true to skip the task.
     */
    skip?: boolean;

    /**
     * To override properties based on build environment.
     */
    envOverrides?: Record<string, Partial<BuildTaskConfigBase>>;
}
