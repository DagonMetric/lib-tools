export interface CommandOptions {
    /**
     * Set libconfig.json file location or set `auto` to analyze project structure automatically..
     */
    libconfig?: string;

    /**
     * Set environment name to override the task configuration with envOverrides options.
     */
    env?: string;

    /**
     * Set project name to Filter project(s).
     */
    project?: string;

    /**
     * Set logging level for output information.
     */
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';
}
