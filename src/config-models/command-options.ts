/**
 * Build command options.
 */
export interface BuildCommandOptions {
    outDir?: string;
    clean?: boolean;
    copy?: string;
    style?: string;
    script?: string;
    packageVersion?: string;
}

/**
 * Command options. *
 */
// Important Note: To sync with command builder options in cli/commands/run.ts
export interface CommandOptions extends BuildCommandOptions {
    workspace?: string;
    project?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    dryRun?: boolean;
    env?: string;
}
