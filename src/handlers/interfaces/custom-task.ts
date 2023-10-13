import { TaskBaseOptions } from '../../config-models/index.js';

import { TaskConfigInfo } from './task-config-info.js';

export interface CustomTask extends Omit<TaskBaseOptions, 'skip'>, TaskConfigInfo {
    [option: string]: unknown;
    readonly taskCategory: 'custom';
    readonly handler: string;
}
