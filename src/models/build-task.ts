import { OverridableTaskOptions, Task } from './task.js';

/**
 * Before build clean options.
 */
export interface BeforeBuildCleanOptions {
    /**
     * If true, delete output directory before build task run.
     */
    cleanOutDir?: boolean;
    /**
     * Extra custom file or directory paths to delete.
     */
    paths?: string[];
    /**
     * List of minimatch patterns to exclude from clean.
     */
    exclude?: string[];
}

/**
 * After build clean options.
 */
export interface AfterBuildCleanOptions {
    /**
     * File or directory paths to delete after build task run.
     */
    paths: string[];
    /**
     * List of minimatch patterns to exclude from clean.
     */
    exclude?: string[];
}

/**
 * Clean options.
 */
export interface CleanOptions {
    /**
     * Clean options for before build task run.
     */
    beforeBuild?: BeforeBuildCleanOptions;
    /**
     * Clean options after build task run.
     */
    afterBuild?: AfterBuildCleanOptions;
}

/**
 * Copy entry options.
 */
export interface CopyEntry {
    /**
     * Source file, directory or minimatch pattern to copy from.
     */
    from: string;
    /**
     * Custom output file or directory name.
     */
    to?: string;
    /**
     * List of minimatch patterns to exclude from copy.
     */
    exclude?: string[];
}

/**
 * @additionalProperties false
 */
export interface StyleBundleEntry {
    /**
     * The input style file. Supported formats are .scss, .sass or .css.
     */
    entry: string;
    /**
     * The output file for bundled css. The output can be directory or css file name relative to project `outputPath`.
     */
    outputFile?: string;
    /**
     * If true, enable the outputing of sourcemap. Default is `true`.
     */
    sourceMap?: boolean;
    /**
     * If true, enable the outputing of sources in the generated source map. Default is `true`.
     */
    sourceMapIncludeSources?: boolean;
    /**
     * Paths in which to look for stylesheets loaded by rules like @use and @import.
     */
    loadPaths?: string[];
    /**
     * Set boolean value to add vendor prefixes to css rules. Default is `true`.
     */
    vendorPrefixes?: boolean;
    /**
     * Set true to generate minify file. Default is `true`.
     */
    minify?: boolean;
}

/**
 * @additionalProperties false
 */
export interface StyleOptions {
    /**
     * List of style compilation / bundle entries.
     */
    bundles: StyleBundleEntry[];
    /**
     * Default sourceMap option to all entries. If true, enable the outputing of sourcemap. Default is `true`.
     */
    sourceMap?: boolean;
    /**
     * Default sourceMapIncludeSources option to all entries. If true, enable the outputing of sources in the generated source map. Default is `true`.
     */
    sourceMapIncludeSources?: boolean;
    /**
     * Default loadPaths option to all entries. Paths in which to look for stylesheets loaded by rules like @use and @import.
     */
    loadPaths?: string[];
    /**
     * Default minify option to all entries. Default is `true`.
     */
    minify?: boolean;
    /**
     * Default vendorPrefixes option to all entries. Set boolean value to add vendor prefixes to css rules. Default is `true`.
     */
    vendorPrefixes?: boolean;
    /**
     * If true, automatically add `style` entry to package.json file.
     */
    updatePackageJson?: boolean;
}

/**
 * @additionalProperties false
 */
export interface ScriptBundleEntry {
    /**
     * Specify the format of the generated bundle.
     */
    moduleFormat?: 'cjs' | 'es' | 'umd';
    /**
     * Entry file to bundle.
     */
    entry?: string;
    /**
     * Custom bundle output file.
     */
    outputFile?: string;
    /**
     *  If true, sourcemap file will be generated.
     */
    sourceMap?: boolean;
    /**
     * If true, minify file will be generated.
     */
    minify?: boolean;
    /**
     * External id and global variable name mapping for bundling options.
     */
    externals?: Record<string, string>;
    /**
     * If true, 'dependencies' keys in package.json are marked as externals and not included in bundle. Default to 'true'.
     */
    dependenciesAsExternals?: boolean;
    /**
     * If true, 'peerDependenciesAsExternals' keys in package.json are marked as externals and not included in bundle. Default to 'true'.
     */
    peerDependenciesAsExternals?: boolean;
}

/**
 * Script options.
 */
export interface ScriptOptions {
    /**
     * If true, emit typescript tsc outputs.
     */
    tsc?: boolean;
    /**
     * List of bundle options.
     */
    bundles?: ScriptBundleEntry[];
    /**
     * Typescript configuration file to be used.
     */
    tsConfig?: string;
    /**
     * Entry file to bundle or entry point name to add to package.json. By default it will be automatically detected.
     */
    entry?: string;
    /**
     * If true, automatically add entry points to package.json file.
     */
    updatePackageJson?: boolean;
    /**
     * External id and global variable name mapping for bundling options.
     */
    externals?: Record<string, string>;
    /**
     * If true, 'dependencies' keys in package.json are marked as externals and not included in bundle. Default to 'true'.
     */
    dependenciesAsExternals?: boolean;
    /**
     * If true, 'peerDependenciesAsExternals' keys in package.json are marked as externals and not included in bundle. Default to 'true'.
     */
    peerDependenciesAsExternals?: boolean;
}

/**
 * Options for package.json file.
 * @additionalProperties false
 */
export interface PackageJsonOptions {
    /**
     * Set version to override the version field of the package.json file/
     */
    packageVersion?: string;
    /**
     * Boolean value whether to update package.json file fields with generated build assets.
     */
    updateFields?: boolean;
    /**
     * Array of field names to be removed from package.json file.
     */
    removeFields?: string[];
}

export interface BuildTaskOptions extends Task {
    /**
     * The output directory for build results.
     */
    outDir?: string;
    /**
     * Clean options for deleting build output files and directories.
     */
    clean?: boolean | CleanOptions;
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
     * Banner text to add at the top of each generated files. It can be file path or raw text.
     */
    banner?: string;
    /**
     * Options for updating package.json file.
     */
    packageJson?: PackageJsonOptions | boolean;
}

/**
 * Build task options.
 */
export interface BuildTask extends BuildTaskOptions, OverridableTaskOptions<BuildTaskOptions> {}
