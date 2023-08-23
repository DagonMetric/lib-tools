export interface BuildCommandOptions {
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';

    /**
     * Set environment name to override the task configuration with envOverrides options.
     */
    env?: string;

    /**
     * Set libconfig.json file location.
     */
    libconfig?: string;

    /**
     * Set project name to Filter project(s).
     */
    project?: string;

    /**
     * Set output directory for build results.
     */
    outputPath?: string;

    /**
     * Set true to clean build output directory before emitting build results.
     */
    clean?: boolean;

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
    /**
     * Set version to override the version field of the generated package.json file.
     */
    version?: string;
}
