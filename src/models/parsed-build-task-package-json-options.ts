import { PackageJsonOptions } from './build-task-package-json-options.js';

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
