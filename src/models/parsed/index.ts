import { BuildTask } from '../build-task.js';
import { CommandOptions } from '../command-options.js';
import { Task } from '../task.js';

export interface ParsedCommandOptions extends CommandOptions {
    readonly _projects: string[];
    readonly _workspaceRoot: string | null;
    readonly _configPath: string | null;
    readonly _env: Record<string, boolean>;

    // For build
    readonly _outDir: string | null;
    readonly _copyEntries: string[];
    readonly _styleEntries: string[];
    readonly _scriptEntries: string[];
}

export interface WorkspaceInfo {
    readonly workspaceRoot: string;
    readonly projectRoot: string;
    readonly projectName: string | null;
    readonly configPath: string | null;
}

export interface ParsedTask extends Task {
    readonly _taskName: string;
    readonly _workspaceInfo: WorkspaceInfo;
}

export interface PackageJsonInfo {
    readonly packageJson: Record<string, unknown>;
    readonly packageJsonPath: string;
    readonly packageName: string;
    readonly packageNameWithoutScope: string;
    readonly packageScope: string | null;
    readonly isNestedPackage: boolean;
    readonly packageVersion: string | null;
    readonly rootPackageJson: Record<string, unknown> | null;
    readonly rootPackageJsonPath: string | null;
}

export interface ParsedBuildTask extends BuildTask, ParsedTask {
    readonly _packageJsonInfo: PackageJsonInfo | null;
    readonly _outDir: string;
}