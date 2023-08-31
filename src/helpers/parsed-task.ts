import { Task } from '../models/index.js';

export interface WorkspaceInfo {
    readonly workspaceRoot: string;
    readonly projectRoot: string;
    readonly projectName: string | null;
    readonly configPath: string | null;
}

export interface ParsedTask extends Task {
    readonly _taskName: string;
    readonly _workspaceInfo: WorkspaceInfo;
}

export function toParsedTask(taskName: string, task: Task, workspaceInfo: WorkspaceInfo): ParsedTask {
    const parsedTask: ParsedTask = {
        ...task,
        _taskName: taskName,
        _workspaceInfo: workspaceInfo
    };

    return parsedTask;
}
