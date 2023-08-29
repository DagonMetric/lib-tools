import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Task } from '../models/index.js';
import { Logger } from '../utils/index.js';

export type TaskHandlerFn = (taskOptions?: ParsedTask, logger?: Logger) => Promise<void>;

export interface WorkspaceInfo {
    readonly workspaceRoot: string;
    readonly projectRoot: string;
    readonly projectName: string | null;
    readonly configPath: string | null;
}

export interface ParsedTask extends Task {
    readonly _taskName: string;
    readonly _workspaceInfo: WorkspaceInfo;
    readonly _handleTask: TaskHandlerFn | null;
}

export class ParsedTaskImpl implements ParsedTask {
    readonly _taskName: string;
    readonly _workspaceInfo: WorkspaceInfo;
    readonly _handleTask: TaskHandlerFn | null;

    constructor(taskName: string, task: Task, workspaceInfo: WorkspaceInfo, handleTask: TaskHandlerFn | null) {
        Object.assign(this, task);

        this._taskName = taskName;
        this._workspaceInfo = workspaceInfo;
        this._handleTask = handleTask;
    }
}

export async function getParsedTask(
    taskName: string,
    task: Task,
    workspaceInfo: WorkspaceInfo
): Promise<ParsedTaskImpl> {
    let taskHandler: TaskHandlerFn | null = null;

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

        taskHandler = nameTaskHander ?? defaultTaskHander;
    }

    const parsedTask = new ParsedTaskImpl(taskName, task, workspaceInfo, taskHandler);

    return parsedTask;
}
