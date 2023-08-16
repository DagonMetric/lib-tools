export interface CommandOptions {
    /**
     * The workflow configuration file location or `auto` to analyze project structure and run task automatically.
     */
    workflow?: string;

    /**
     * Environment name to override the task configuration with `envOverrides[environment]` options.
     */
    environment?: Record<string, boolean | string>;

    /**
     * Filter project(s) by project name(s).
     */
    filter?: string | string[];

    /**
     * Logging level for output information.
     */
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'none';
}
