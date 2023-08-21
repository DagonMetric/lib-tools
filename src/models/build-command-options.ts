import { CommandOptions } from './command-options.js';

/**
 * @additionalProperties false
 */
export interface BuildCommandOptions extends CommandOptions {
    /**
     * Set version to override the version field of the generated package.json file.
     */
    version?: string;
}
