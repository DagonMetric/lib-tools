import { Task } from '../models/index.js';

export interface WorkspaceInfo {
    readonly workspaceRoot: string;
    readonly projectRoot: string;
    readonly projectName: string | null;
    readonly configPath: string | null;
}

export interface ParsedTaskConfig extends Task {
    readonly taskName: string;
    readonly workspaceInfo: WorkspaceInfo;
}

export class ParsedTaskConfigImpl implements ParsedTaskConfig {
    readonly taskName: string;
    readonly workspaceInfo: WorkspaceInfo;

    constructor(taskName: string, config: Task, workspaceInfo: WorkspaceInfo) {
        Object.assign(this, config);

        this.taskName = taskName;
        this.workspaceInfo = workspaceInfo;
    }
}

export function getParsedTaskConfig(taskName: string, config: Task, workspaceInfo: WorkspaceInfo): ParsedTaskConfig {
    const parsedBuildTaskConfig = new ParsedTaskConfigImpl(taskName, config, workspaceInfo);

    return parsedBuildTaskConfig;
}
