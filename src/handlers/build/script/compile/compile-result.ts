export interface CompileResult {
    readonly builtAssets: { path: string; size: number }[];
    readonly time: number;
}
