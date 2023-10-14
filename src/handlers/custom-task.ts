import { TaskOptions } from '../config-models/index.js';

import { TaskInfo } from './task-info.js';

export interface CustomTask extends Omit<TaskOptions, 'skip'>, TaskInfo {
    [option: string]: unknown;
    readonly taskCategory: 'custom';
    readonly handler: string;
}
