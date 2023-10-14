export interface TaskInfo {
    readonly taskName: string;
    readonly workspaceRoot: string;
    readonly projectRoot: string;
    readonly projectName?: string;
    readonly configPath?: string | null;
}
