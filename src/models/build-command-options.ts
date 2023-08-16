import { CommandOptions } from './command-options.js';

/**
 * @additionalProperties true
 */
export interface BuildCommandOptions extends CommandOptions {
    /**
     * Set the version to override the version field of the package.json file.
     */
    version?: string;
}
