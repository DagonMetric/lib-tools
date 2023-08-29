/**
 * Important: To sync with ../helpers/commands/run
 */
export interface BuildCommandOptions {
    // Build command options
    env?: string;
    outDir?: string;
    clean?: boolean;
    copy?: string;
    style?: string;
    script?: string;
    packageVersion?: string;
}

/**
 * Important: To sync with ../helpers/commands/run
 */
export interface CommandOptions extends BuildCommandOptions {
    task?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';
    workspace?: string;
    project?: string;
}
