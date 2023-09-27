import { ScriptTarget } from 'typescript';

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
     * Extra list of files or directories or glob magic paths to delete before build task run.
     */
    paths?: string[];
    /**
     * List of files or directories or glob magic paths to exclude from clean.
     */
    exclude?: string[];
}

/**
 * After build clean options.
 */
export interface AfterBuildCleanOptions {
    /**
     * List of files or directories or glob magic paths to delete after build task run.
     */
    paths: string[];
    /**
     * List of files or directories or glob magic paths to exclude from clean.
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
     * Source file, directory or glob magic path to copy from.
     */
    from: string;
    /**
     * Custom output file or directory name.
     */
    to?: string;
    /**
     * List of files or directories or glob magic paths to exclude from copy.
     */
    exclude?: string[];
}

/**
 * Style bundle entry options.
 */
export interface StyleBundle {
    /**
     * The entry style file. Supported formats are .scss, .sass, .less or .css.
     */
    entry: string;
    /**
     * The output bundle name for generated .css file. It can be a bundle name or a directory path relative to project `outDir`.
     */
    out?: string;
}

/**
 * Css minify options.
 */
export interface StyleMinifyOptions {
    /**
     * If true, both minified and unminified files will be generated. Default is `true`.
     * @default true
     */
    separateMinifyFile?: boolean;
    /**
     * If true, source file will be generated for separate minified .min.css file. Default is `false`.
     * @default false
     */
    sourceMapInMinifyFile?: boolean;
}

/**
 * Css bundle target options.
 */
export interface CssTargetOptions {
    /**
     *  List of queries for target browsers.
     */
    browers?: string[] | null;
    /**
     * Determine which CSS features to polyfill, based upon their process of becoming implemented web standards.
     * Default value is `3`.
     * @default 3
     */
    stage?: 0 | 1 | 2 | 3 | 4 | false;
    /**
     * Determine which CSS features to polyfill, based their implementation status.
     * Default value is `0`.
     * @default: 0
     */
    minimumVendorImplementations?: 0 | 1 | 2 | 3;
}

/**
 * Style compilation / bundle options.
 */
export interface StyleOptions {
    /**
     * List of style bundle entries.
     */
    bundles: StyleBundle[];
    /**
     * If true, enable the outputing of sourcemap. Default is `true`.
     * @default true
     */
    sourceMap?: boolean;
    /**
     * Paths in which to look for stylesheets loaded by rules like @use and @import.
     */
    includePaths?: string[];
    /**
     * Boolean value or minify object options to generate minify file. Default is `true`.
     * @default true
     */
    minify?: boolean | StyleMinifyOptions;
    /**
     * Css bundle target options.
     */
    target?: CssTargetOptions;
}

/**
 * Script module format.
 */
export type ScriptModuleFormat = 'iife' | 'cjs' | 'esm';

/**
 * Script target.
 */
export type ScriptTargetStrings = keyof typeof ScriptTarget;

/**
 * Script compilation / bundle options.
 */
export interface ScriptCompilation {
    /**
     * If true, all imported dependencies will be inlined into the generated output file.
     */
    bundle?: boolean;
    /**
     * Entry file.
     */
    entry?: string;
    /**
     * Custom output bundle file name or directory path relative to project `outDir`.
     */
    out?: string;
    /**
     * Module format.
     */
    moduleFormat?: ScriptModuleFormat;
    /**
     * Script target.
     */
    scriptTarget?: ScriptTargetStrings;
    /**
     * Typescript configuration file for this compilation.
     */
    tsconfig?: string;
    /**
     * To override `declaration` options in tsconfig.
     */
    declaration?: boolean;
    /**
     * If true, only output d.ts files not javascript files.
     */
    emitDeclarationOnly?: boolean;

    /**
     * Target environments for this compilation.
     */
    environmentTargets?: string[];
    /**
     *  If true, sourcemap file will be generated.
     */
    sourceMap?: boolean;
    /**
     * If true, minify file will be generated.
     */
    minify?: boolean;
    /**
     * Exclude list for externals for this compilation.
     */
    externalExclude?: string[];
}

/**
 * Script compilation / bundle options.
 */
export interface ScriptOptions {
    /**
     * Specify list of script compilation / bundle options. Set `auto` for automatic compilations based on project structure.
     */
    compilations: ScriptCompilation[] | 'auto';
    /**
     * Specify typescript configuration file.
     */
    tsconfig?: string;
    /**
     * Specify target environments.
     */
    environmentTargets?: string[];
    /**
     * Specify list of external modules.
     */
    externals?: (Record<string, string> | string)[];
    /**
     * Specify exclude list for externals.
     */
    externalExclude?: string[];
    /**
     * If true, all package dependency fields in package.json are marked as externals. Default is 'true'.
     */
    packageDependenciesAsExternals?: boolean;
}

/**
 * Options for package.json file updating.
 */
export interface PackageJsonOptions {
    /**
     * Set version to override the version field of the package.json file.
     */
    packageVersion?: string;
    /**
     * Boolean value whether to update package.json file fields with generated build result paths.
     */
    updateFields?: boolean;
    /**
     * Array of field names to be removed from package.json file.
     */
    removeFields?: string[];
}

/**
 * Build task options.
 */
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
     * List of files to copy to output directory.
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
     * Set true to search banner.txt file or set banner file path to add banner content to the top of each generated file.
     */
    banner?: boolean | string;
    /**
     * Options for package.json file updating.
     */
    packageJson?: PackageJsonOptions | boolean;
}

/**
 * Build task options.
 */
export interface BuildTask extends BuildTaskOptions, OverridableTaskOptions<BuildTaskOptions> {}
