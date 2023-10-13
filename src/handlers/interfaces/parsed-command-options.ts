import { CommandOptions } from '../../config-models/index.js';

export interface ParsedCommandOptions
    extends Readonly<Pick<CommandOptions, 'logLevel' | 'dryRun' | 'env' | 'clean' | 'packageVersion'>> {
    readonly workspaceRoot: string;
    readonly configPath: string | null;
    readonly projects: readonly string[];

    // For build
    readonly outDir: string | null;
    readonly copy: readonly string[];
    readonly style: readonly string[];
    readonly script: readonly string[];
}
