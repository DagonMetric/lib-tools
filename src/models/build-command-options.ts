/**
 * @additionalProperties false
 */
export interface BuildCommandOptions {
    /**
     * Set environment name to override the task configuration with envOverrides options.
     */
    env?: string;

    /**
     * Set libconfig.json file location.
     */
    libconfig?: string;

    /**
     * Set logging level for output information.
     */
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';

    /**
     * Set project name to Filter project(s).
     */
    project?: string;

    /**
     * Set version to override the version field of the generated package.json file.
     */
    version?: string;

    /**
     * Set output directory for build results.
     */
    outputPath?: string;

    /**
     * Set true to clean ouput directory or set clean path to clean specific path.
     */
    clean?: string | boolean;

    /**
     * Set path to copy assets to output directory.
     */
    copy?: string;

    /**
     * Set SCSS or CSS file entry to compile or bundle.
     */
    style?: string;

    /**
     * Set TypeScript or JavaScript file entry to compile or bundle.
     */
    script?: string;
}
