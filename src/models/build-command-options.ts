export interface BuildCommandOptions {
    logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';
    env?: string;
    libconfig?: string;
    project?: string;
    outputPath?: string;
    clean?: boolean;
    copy?: string;
    style?: string;
    script?: string;
    version?: string;
}
