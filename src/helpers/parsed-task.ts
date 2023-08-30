import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Task } from '../models/index.js';
import { Logger } from '../utils/index.js';

export type TaskHandlerFn = (taskOptions?: ParsedTask, logger?: Logger) => Promise<void> | void;

export interface WorkspaceInfo {
    readonly workspaceRoot: string;
    readonly projectRoot: string;
    readonly projectName: string | null;
    readonly configPath: string | null;
}

export interface ParsedTask extends Task {
    readonly _taskName: string;
    readonly _workspaceInfo: WorkspaceInfo;
    readonly _handleTaskFn: TaskHandlerFn | null;
}

export async function getParsedTask(taskName: string, task: Task, workspaceInfo: WorkspaceInfo): Promise<ParsedTask> {
    let taskHandlerFn: TaskHandlerFn | null = null;

    if (task.handler?.trim().length) {
        const projectRoot = workspaceInfo.projectRoot;
        const handlerPath = path.isAbsolute(task.handler)
            ? path.resolve(task.handler)
            : path.resolve(projectRoot, task.handler);

        const handlerModule = (await import(pathToFileURL(handlerPath).toString())) as {};

        let defaultTaskHander: TaskHandlerFn | null = null;
        let nameTaskHander: TaskHandlerFn | null = null;

        for (const [key, value] of Object.entries(handlerModule)) {
            if (key === 'default') {
                defaultTaskHander = value as TaskHandlerFn;
            } else if (key === taskName) {
                nameTaskHander = value as TaskHandlerFn;
                break;
            }
        }

        taskHandlerFn = nameTaskHander ?? defaultTaskHander;
    }

    const parsedTask: ParsedTask = {
        ...task,
        _taskName: taskName,
        _workspaceInfo: workspaceInfo,
        _handleTaskFn: taskHandlerFn
    };

    return parsedTask;
}
