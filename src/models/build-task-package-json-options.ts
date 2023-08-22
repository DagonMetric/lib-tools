/**
 * @additionalProperties false
 */
export interface PackageJsonOptions {
    /**
     * Boolean value whether to update package.json file fields with generated build assets.
     */
    updateFields?: boolean;

    /**
     * Array of field names to be removed from package.json file.
     */
    removeFields?: string[];
}
