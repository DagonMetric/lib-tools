import { BuildTaskConfig, PackageJsonOptions } from './build-task-config.js';

export interface ParsedPackageJsonOptions extends PackageJsonOptions {
    _packageJson: Record<string, unknown>;
    _packageJsonPath: string;
    _packageName: string;
    _packageNameWithoutScope: string;
    _packageScope: string | null;
    _nestedPackage: boolean;

    _packageVersion: string | null;
    _packageJsonOutDir: string | null;

    _rootPackageJson: Record<string, unknown> | null;
    _rootPackageJsonPath: string | null;
}

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
