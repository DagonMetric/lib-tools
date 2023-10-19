/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { ModuleKind as TsModuleKind, ScriptTarget as TsScriptTarget } from 'typescript';
import { TaskOptions } from './task-options.mjs';

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
 * Substitution entry.
 */
export interface SubstitutionEntry {
    /**
     * Search text.
     */
    searchValue: string;
    /**
     * Replace value.
     */
    replaceValue: string;
    /**
     * If true only apply to banner.
     */
    bannerOnly?: boolean;
    /**
     * Start boundary delimiter. Default: `\\b`.
     */
    startDelimiter?: string;
    /**
     * End boundary delimiter. Default: `\\b(?!\\.)`.
     */
    endDelimiter?: string;
    /**
     * List of files to include in substitution.
     */
    files?: string[];
}

/**
 * Substitution options.
 */
export interface SubstitutionOptions {
    /**
     * Substitution entries.
     */
    values?: SubstitutionEntry[];
    /**
     * Start boundary delimiter. Default: `\\b`.
     */
    startDelimiter?: string;
    /**
     * End boundary delimiter. Default: `\\b(?!\\.)`.
     */
    endDelimiter?: string;
    /**
     * List of files to include in substitution.
     */
    files?: string[];
}

/**
 * Style compilation / bundle options.
 */
export interface StyleCompilation {
    /**
     * The entry style file. Supported formats are .scss, .sass, .less or .css.
     */
    entry: string;
    /**
     * The output bundle name for generated .css file. It can be a bundle name or a directory path relative to project `outDir`.
     */
    out?: string;
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
     * List of style compilations / bundle entries.
     */
    compilations: StyleCompilation[];
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
    /**
     * Substitution options.
     */
    substitutions?: boolean | SubstitutionOptions;
    /**
     * Set `true` value to search banner file automatically, or set file path to add banner content to the generated style files.
     */
    banner?: string | boolean;
    /**
     * Set `true` value to search footer file automatically, or set file path to add footer content to the generated style files.
     */
    footer?: string | boolean;
}

/**
 * Script module format for typescript compiler tool.
 */
export type TypescriptScriptModuleFormat = Lowercase<Exclude<keyof typeof TsModuleKind, 'None'>>;

/**
 * Script module format for esbuild bundler tool.
 */
export type EsBuildScriptModuleFormat = 'cjs' | 'esm' | 'iife';

/**
 * Script module format for rollup bundler tool.
 */
export type RollupScriptModuleFormat = 'cjs' | 'esm' | 'iife' | 'umd' | 'amd' | 'system';

/**
 * Script module format for webpack bundler tool.
 */
export type WebpackScriptModuleFormat =
    | 'iife'
    | 'umd'
    | 'amd'
    | 'amd-require'
    | 'var'
    | 'module'
    | 'assign'
    | 'assign-properties'
    | 'this'
    | 'window'
    | 'self'
    | 'global'
    | 'commonjs'
    | 'commonjs2'
    | 'commonjs-module'
    | 'commonjs-static'
    | 'umd2'
    | 'system';

/**
 * Script module format.
 */
export type ScriptModuleFormat =
    | TypescriptScriptModuleFormat
    | EsBuildScriptModuleFormat
    | RollupScriptModuleFormat
    | WebpackScriptModuleFormat;

/**
 * Script target.
 */
export type ScriptTarget = Exclude<keyof typeof TsScriptTarget, 'JSON' | 'ES3' | 'Latest'>;

/**
 * Treeshaking options.
 */
export interface TreeshakingOptions {
    annotations?: boolean;
    correctVarValueBeforeDeclaration?: boolean;
    manualPureFunctions?: string[];
    moduleSideEffects?: boolean | 'no-external' | string[];
    propertyReadSideEffects?: boolean | 'always';
    tryCatchDeoptimization?: boolean;
    unknownGlobalSideEffects?: boolean;
}

/**
 * Asset loader.
 */
export type AssetLoader = 'base64' | 'binary' | 'copy' | 'dataurl' | 'default' | 'file' | 'json' | 'text';

/**
 * Script compilation / bundle options.
 */
export interface ScriptCompilation {
    /**
     * Preferred compiler / bundler tool for this compilation. By default, it will be selected automatically.
     */
    compiler?: 'tsc' | 'esbuild' | 'rollup' | 'webpack' | 'custom';
    /**
     * Entry points.
     */
    entry?: string | string[] | Record<string, string>;
    /**
     * Custom output directory path relative to project `outDir`.
     */
    outDir?: string;
    /**
     * Module format.
     */
    moduleFormat?: ScriptModuleFormat;
    /**
     * Script target.
     */
    scriptTarget?: ScriptTarget;
    /**
     *  If true, sourcemap file will be generated. This will override `sourceMap` and 'inlineSourceMap' options in tsconfig.
     */
    sourceMap?: boolean;
    /**
     * Typescript configuration file for this compilation.
     */
    tsconfig?: string;
    /**
     * If true, only output d.ts files not javascript files. This will override `emitDeclarationOnly` options in tsconfig.
     */
    emitDeclarationOnly?: boolean;
    /**
     * If true, d.ts files will be generated. This will override `declaration` options in tsconfig.
     */
    declaration?: boolean;
    /**
     * If true, all imported dependencies will be inlined into the generated output file.
     */
    bundle?: boolean;
    /**
     * Loader options for assets.
     */
    assetLoaders?: Record<string, AssetLoader>;
    /**
     * Custom output name of the additional output files generated by asset loaders.
     */
    assetOut?: string;
    /**
     * Global name for iife module format.
     */
    globalName?: string;
    /**
     * If true, minify file will be generated.
     */
    minify?: boolean;
    /**
     * Treeshaking options.
     */
    treeshake?: boolean | TreeshakingOptions;
    /**
     * Target environments for this compilation.
     */
    environmentTargets?: string[];
    /**
     * Exclude list for externals for this compilation.
     */
    externalExclude?: string[];
}

/**
 * Script compilation options for typescript compiler tool.
 */
export interface TypescriptScriptCompilation extends ScriptCompilation {
    /**
     * Preferred compiler / bundler tool for this compilation. By default, it will be selected automatically.
     */
    compiler: 'tsc';
    /**
     * Module format.
     */
    moduleFormat?: TypescriptScriptModuleFormat;
}

/**
 * Script compilation options for esbuild bundler tool.
 */
export interface EsBuildScriptCompilation extends Omit<ScriptCompilation, 'emitDeclarationOnly' | 'declaration'> {
    /**
     * Preferred compiler / bundler tool for this compilation. By default, it will be selected automatically.
     */
    compiler: 'esbuild';
    /**
     * Module format.
     */
    moduleFormat?: EsBuildScriptModuleFormat;
    /**
     * Treeshaking options.
     */
    treeshake?: boolean;
}

/**
 * Script compilation options for rollup bundler tool.
 */
export interface RollupScriptCompilation extends ScriptCompilation {
    /**
     * Preferred compiler / bundler tool for this compilation. By default, it will be selected automatically.
     */
    compiler: 'rollup';
    /**
     * Module format.
     */
    moduleFormat?: RollupScriptModuleFormat;
    /**
     * Treeshaking options.
     */
    treeshake?: boolean | TreeshakingOptions;
}

/**
 * Script compilation options for webpack bundler tool.
 */
export interface WebpackScriptCompilation extends ScriptCompilation {
    /**
     * Preferred compiler / bundler tool for this compilation. By default, it will be selected automatically.
     */
    compiler: 'webpack';
    /**
     * Module format.
     */
    moduleFormat?: WebpackScriptModuleFormat;
    /**
     * Treeshaking options.
     */
    treeshake?: boolean;
}

export interface CustomScriptCompilation extends ScriptCompilation {
    /**
     * Preferred compiler / bundler tool for this compilation. By default, it will be selected automatically.
     */
    compiler: 'custom';
    /**
     * Custom compiler module.
     */
    compilerModule: string;
}

/**
 * Script compilation / bundle options.
 */
export interface ScriptOptions {
    /**
     * Specify list of script compilation / bundle options. Set true for automatic compilations based on project structure.
     */
    compilations:
        | (
              | ScriptCompilation
              | TypescriptScriptCompilation
              | EsBuildScriptCompilation
              | RollupScriptCompilation
              | WebpackScriptCompilation
              | CustomScriptCompilation
          )[]
        | boolean;
    /**
     * Specify typescript configuration file.
     */
    tsconfig?: string;
    /**
     * Specify target environments.
     */
    environmentTargets?: string[];
    /**
     * If true, all package dependency fields in package.json are marked as externals. Default is 'true'.
     */
    packageDependenciesAsExternals?: boolean;
    /**
     * List of external modules.
     */
    externals?: (Record<string, string> | string)[];
    /**
     * Specify exclude list for externals.
     */
    externalExclude?: string[];
    /**
     * Enable or disable resolving symlinks to their realpaths.
     */
    preserveSymlinks?: boolean;
    /**
     * Substitution options.
     */
    substitutions?: boolean | SubstitutionOptions;
    /**
     * Set `true` value to search banner file automatically, or set file path to add banner content to the generated script files.
     */
    banner?: string | boolean;
    /**
     * Set `true` value to search footer file automatically, or set file path to add footer content to the generated script files.
     */
    footer?: string | boolean;
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
export interface BuildTaskOptions extends TaskOptions {
    /**
     * The output directory for build results. Default: `dist`.
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
     * Options for package.json file updating.
     */
    packageJson?: PackageJsonOptions | boolean;
}
