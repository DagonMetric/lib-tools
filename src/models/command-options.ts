export interface BuildCommandOptions {
    // Build command options
    env?: string;
    outputPath?: string;
    clean?: boolean;
    copy?: string;
    style?: string;
    script?: string;
    packageVersion?: string;
}

export interface CommandOptions extends BuildCommandOptions {
    task?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';
    workspace?: string;
    project?: string;
}
