/**
 * @additionalProperties false
 */
export interface CopyEntry {
    /**
     * The source file, folder path or minimatch pattern.
     */
    from: string;
    /**
     * Custom output file or folder name.
     */
    to?: string;
    /**
     * Exclude list of minimatch patterns.
     */
    exclude?: string[];
}
