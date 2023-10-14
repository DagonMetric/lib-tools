/**
 * @internal
 */
export interface ParsedBannerOptions {
    readonly text: string;
    readonly exclude?: readonly string[];
    readonly include?: readonly string[];
}
