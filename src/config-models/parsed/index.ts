import { BuildTask } from '../build-task.js';
import { CommandOptions } from '../command-options.js';
import { CustomTask } from '../custom-task.js';
import { Task } from '../task.js';

export interface ParsedCommandOptions extends CommandOptions {
    readonly _projects: readonly string[];
    readonly _workspaceRoot: string;
    readonly _configPath: string | null;

    // For build
    readonly _outDir: string | null;
    readonly _copyEntries: readonly string[];
    readonly _styleEntries: readonly string[];
    readonly _scriptEntries: readonly string[];
}

export interface PackageJsonLike {
    [key: string]: unknown;
    name?: string;
    version?: string;
}

export interface PackageJsonInfo {
    readonly packageJson: Readonly<PackageJsonLike>;
    readonly packageJsonPath: string;
    readonly packageName: string;
    readonly packageScope: string | null;
    readonly rootPackageJson: Readonly<PackageJsonLike> | null;
    readonly rootPackageJsonPath: string | null;
    readonly newPackageVersion: string | null;
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
    readonly _workspaceInfo: Readonly<WorkspaceInfo>;
}

export interface SubstitutionInfo {
    searchString: string;
    value: string;
    bannerOnly: boolean;
}

export interface ParsedBuildTaskConfig extends BuildTask, ParsedTaskConfig {
    readonly _outDir: string;
    readonly _bannerTextForStyle: string | undefined;
    readonly _bannerTextForScript: string | undefined;
    readonly _footerTextForStyle: string | undefined;
    readonly _footerTextForScript: string | undefined;
    readonly _substitutions: readonly Readonly<SubstitutionInfo>[];
    readonly _packageJsonInfo: Readonly<PackageJsonInfo> | null;
}

export interface ParsedCustomTaskConfig extends CustomTask, ParsedTaskConfig {}
