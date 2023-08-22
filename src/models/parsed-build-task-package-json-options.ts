import { PackageJsonOptions } from './build-task-package-json-options.js';

export interface ParsedPackageJsonOptions extends PackageJsonOptions {
    _packageJsonOutDir: string | null;
    _packageJsonPath: string | null;
    _packageJson: Record<string, unknown> | null;
    _packageName: string | null;
    _packageNameWithoutScope: string | null;
    _packageScope: string | null;
    _packageVersion: string | null;
    _nestedPackage: boolean | null;
    _rootPackageJsonPath: string | null;
    _rootPackageJson: Record<string, unknown> | null;
}
