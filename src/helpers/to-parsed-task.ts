import { Task } from '../models/index.js';
import { ParsedTask, WorkspaceInfo } from '../models/parsed/index.js';

export function toParsedTask(taskName: string, task: Task, workspaceInfo: WorkspaceInfo): ParsedTask {
    const parsedTask: ParsedTask = {
        ...task,
        _taskName: taskName,
        _workspaceInfo: workspaceInfo
    };

    return parsedTask;
}
