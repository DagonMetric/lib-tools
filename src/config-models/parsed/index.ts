import { BuildTask } from '../build-task.js';
import { CommandOptions } from '../command-options.js';
import { Task } from '../task.js';

export interface ParsedCommandOptions extends CommandOptions {
    readonly _projects: string[];
    readonly _workspaceRoot: string;
    readonly _configPath: string | null;
    readonly _env: Record<string, boolean>;

    // For build
    readonly _outDir: string | null;
    readonly _copyEntries: string[];
    readonly _styleEntries: string[];
    readonly _scriptEntries: string[];
}

export interface PackageJsonInfo {
    readonly packageJson: { [key: string]: unknown; name?: string; version?: string };
    readonly packageJsonPath: string;
    readonly packageName: string;
    readonly packageNameWithoutScope: string;
    readonly packageScope: string | null;
    readonly isNestedPackage: boolean;
    readonly rootPackageVersion: string | null;
}

export interface WorkspaceInfo {
    readonly workspaceRoot: string;
    readonly projectRoot: string;
    readonly projectName: string | null;
    readonly configPath: string | null;
    readonly nodeModulePath: string | null;
}

export interface ParsedTaskConfig extends Task {
    readonly _taskName: string;
    readonly _workspaceInfo: WorkspaceInfo;
}

export interface ParsedBuildTaskConfig extends BuildTask, ParsedTaskConfig {
    readonly _outDir: string;
    readonly _packageJsonInfo: PackageJsonInfo | null;
}
