/**
 * @internal
 */
export function formatSizeInBytes(size: number): string {
    if (size < 1024) {
        return `${size.toLocaleString('en-US', { maximumFractionDigits: 2 })} bytes`;
    } else if (size < 1024 * 1024) {
        return `${(size / 1024).toLocaleString('en-US', { maximumFractionDigits: 2 })} KB`;
    } else {
        return `${(size / (1024 * 1024)).toLocaleString('en-US', { maximumFractionDigits: 2 })} MB`;
    }
}
