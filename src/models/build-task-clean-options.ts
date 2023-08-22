/**
 * @additionalProperties false
 */
export interface BeforeRunCleanOptions {
    /**
     * If true, delete output directory before build. Default is `true`.
     */
    cleanOutDir?: boolean;
    /**
     * Custom file or directory paths to delete.
     */
    paths?: string[];
    /**
     * Exclude list of minimatch patterns.
     */
    exclude?: string[];
}

/**
 * @additionalProperties false
 */
export interface AfterEmitCleanOptions {
    /**
     * File or directory paths to delete after build emit assets.
     */
    paths?: string[];
    /**
     * Exclude list of minimatch patterns.
     */
    exclude?: string[];
}

/**
 * @additionalProperties false
 */
export interface CleanOptions {
    /**
     * Clean options for before build task run.
     */
    beforeRun?: BeforeRunCleanOptions;
    /**
     * Clean options after emit.
     */
    afterEmit?: AfterEmitCleanOptions;
    /**
     * If true, allow cleaning outside of the output directory.
     */
    allowOutsideOutDir?: boolean;
    /**
     * If true, allow cleaning outside of the workspace root directory.
     */
    allowOutsideWorkspaceRoot?: boolean;
}
