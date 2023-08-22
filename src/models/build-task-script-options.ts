/**
 * @additionalProperties false
 */
export interface CommonJsOptions {
    /**
     * Array of minimatch patterns which specifies the files in the build the plugin should ignore. By default non-CommonJS modules are ignored.
     */
    exclude?: string[];
    /**
     * Array of minimatch patterns, which specifies the files in the build the plugin should operate on. By default CommonJS modules are targeted.
     */
    include?: string[];
    /**
     * Search for files other than .js files.
     */
    extensions?: string[];
    /**
     * If true, uses of global won't be deal.
     */
    ignoreGlobal?: boolean;
    /**
     * If false, skip sourceMap generation for CommonJS modules.
     */
    sourceMap?: boolean;
    /**
     * Instructs the plugin whether or not to enable mixed module transformations. This is useful in scenarios with mixed ES and CommonJS modules. Set to `true` if it's known that `require` calls should be transformed, or `false` if the code contains env detection and the `require` should survive a transformation.
     */
    transformMixedEsModules?: boolean;
    /**
     * Sometimes you have to leave require statements unconverted. Pass an array containing the IDs.
     */
    ignore?: string[];
    /**
     * Some modules contain dynamic require calls, or require modules that contain circular dependencies, which are not handled well by static imports. Including those modules as dynamicRequireTargets will simulate a CommonJS (NodeJS-like) environment for them with support for dynamic and circular dependencies.
     */
    dynamicRequireTargets?: string[];
}

export type ScriptBundleModuleKind = 'cjs' | 'umd' | 'es';

/**
 * @additionalProperties false
 */
export interface ScriptBundleSharedOptions {
    /**
     * Custom bundle output file.
     */
    outputFile?: string;

    /**
     * If true, minify file will be generated.
     */
    minify?: boolean;

    /**
     *  If true, sourcemap file will be generated.
     */
    sourceMap?: boolean;

    /**
     * CommonJS options or boolean value to convert commonjs modules to es module and include in bundle.
     */
    commonjs?: CommonJsOptions | boolean;

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
 * @additionalProperties false
 */
export interface ScriptBundleOptions extends ScriptBundleSharedOptions {
    /**
     * Specify the format of the generated bundle.
     */
    moduleFormat: ScriptBundleModuleKind;
}

/**
 * @additionalProperties false
 */
export interface ScriptCompilationOptions {
    /**
     * Override custom script target.
     */
    target: string;
    /**
     * Custom output directory.
     */
    outDir?: string;
    /**
     * Override declaration option. Default `true` to first entry.
     */
    declaration?: boolean;
    /**
     * Set true to bundle compilation output to esm module format.
     */
    esBundle?: boolean | ScriptBundleSharedOptions;
    /**
     * Set true to bundle compilation output to umd module format.
     */
    umdBundle?: boolean | ScriptBundleSharedOptions;
    /**
     * Set true to bundle compilation output to commonjs module format.
     */
    cjsBundle?: boolean | ScriptBundleSharedOptions;
    /**
     * If true, compilation outputs (non-bundle outputs) are deleted after bundle(s) are generated.
     */
    deleteNonBundleOutputs?: boolean;
}

/**
 * @additionalProperties false
 */
export interface ScriptOptions {
    /**
     * List of compilation options or `auto` for automatic compilations based on project structure.
     */
    compilations?: 'auto' | ScriptCompilationOptions[];

    /**
     * List of bundle options.
     */
    bundles?: ScriptBundleOptions[];

    /**
     * Typescript configuration file to be used.
     */
    tsConfig?: string;

    /**
     * If true, automatically add entry points to package.json file.
     */
    addToPackageJson?: boolean;

    /**
     * Entry file to bundle or entry point name to add to package.json. By default it will be automatically detected.
     */
    entry?: string;

    /**
     * If true, search version placeholders in compiled files and replace with package version.
     */
    replaceVersionPlaceholder?: boolean;

    /**
     * Define module id for umd bundle.
     */
    umdId?: string;

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
