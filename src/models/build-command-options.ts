import { CommandOptions } from './command-options.js';

export interface BuildCommandOptions extends CommandOptions {
    env?: string;
    outputPath?: string;
    clean?: boolean;
    copy?: string;
    style?: string;
    script?: string;
    version?: string;
}
