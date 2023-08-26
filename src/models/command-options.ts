export interface CommandOptions {
    task?: string;
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';
    workspace?: string;
    project?: string;

    // Build command options
    env?: string;
    outputPath?: string;
    clean?: boolean;
    copy?: string;
    style?: string;
    script?: string;
    packageVersion?: string;
}
