import { TaskOptions } from '../../config-models/index.js';

import { TaskConfigInfo } from './task-config-info.js';

export interface CustomTask extends Omit<TaskOptions, 'skip'>, TaskConfigInfo {
    [option: string]: unknown;
    readonly taskCategory: 'custom';
    readonly handler: string;
}
