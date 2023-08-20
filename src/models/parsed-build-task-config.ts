import {
    AssetEntry,
    AutoPrefixerOptions,
    BuildTaskConfig,
    CssMinimizerPresetOptions,
    ScriptBundleOptions,
    ScriptCompilationOptions,
    ScriptOptions,
    StyleEntry
} from './build-task-config.js';

export interface StyleEntryInternal extends StyleEntry {
    _inputFilePath: string;
    _outputFilePath: string;
    _loadPaths: string[];
    _sourceMap: boolean;
    _sourceMapIncludeSources: boolean;
    _vendorPrefixes: boolean | AutoPrefixerOptions;
    _minify: boolean | CssMinimizerPresetOptions;
    _minOutputFilePath: string;
}

export interface TsConfigInfo {
    tsConfigPath: string;
    tsConfigJson: TsConfigJsonOptions;
}

export interface TsConfigJsonOptions {
    extends?: string;
    compilerOptions?: Record<string, unknown>;
    files?: string[];
}

export interface ScriptBundleOptionsInternal extends ScriptBundleOptions {
    _entryFilePath: string;
    _outputFilePath: string;
    _externals: string[];
    _globals: Record<string, string>;
    _umdId?: string;
    _ecma?: number;
}

export interface ScriptCompilationOptionsInternal extends ScriptCompilationOptions {
    _declaration: boolean;
    _scriptTarget: number;
    _tsOutDirRootResolved: string;
    _customTsOutDir: string | null;
    _tsConfigInfo: TsConfigInfo;
    _entryName: string;
    _bundles: ScriptBundleOptionsInternal[];
}

export interface ScriptOptionsInternal extends ScriptOptions {
    _tsConfigInfo: TsConfigInfo | null;
    _projectTypescriptModulePath: string | null;
    _entryName: string | null;
    _compilations: ScriptCompilationOptionsInternal[];
    _bundles: ScriptBundleOptionsInternal[];
}

export interface ParsedPackageJson {
    _packageJsonOutDir: string;
    _packageJsonPath: string;
    _packageJson: Record<string, unknown>;
    _packageName: string;
    _packageNameWithoutScope: string;
    _packageScope?: string | null;
    _packageVersion?: string;
    _nestedPackage?: boolean;
    _rootPackageJsonPath?: string | null;
    _rootPackageJson?: Record<string, unknown> | null;
}

export interface ParsedBuildTaskConfig extends BuildTaskConfig {
    _workspaceRoot: string;
    _config: string;
    _nodeModulesPath: string | null;
    _projectName: string;
    _projectRoot: string;
    _outputPath: string;
    _bannerText?: string;

    // package.json
    _packageJson?: ParsedPackageJson | null;
    // package.json
    // _packageJsonEntryPoint: Record<string, string>;
    // _packageJsonLastModuleEntryScriptTarget?: number;

    // Assets
    _assetEntries?: AssetEntry[] | null;

    // styles
    _styleEntries?: StyleEntryInternal[] | null;

    // scripts
    _script?: ScriptOptionsInternal | null;
}
