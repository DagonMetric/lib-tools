/**
 * Build command options.
 * Important: To sync with command builder options in cli/commands/run.ts
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
 * Command options.
 * Important: To sync with command builder options in cli/commands/run.ts
 */
export interface CommandOptions extends BuildCommandOptions {
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    workspace?: string;
    project?: string;
    env?: string;
    dryRun?: boolean;
}
