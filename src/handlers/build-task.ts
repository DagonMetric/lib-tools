import { BuildTaskOptions } from '../config-models/index.js';

import { TaskInfo } from './task-info.js';

export interface BuildTask extends Omit<BuildTaskOptions, 'skip'>, TaskInfo {
    readonly taskCategory: 'build';
    readonly taskName: 'build';
    readonly outDir: string;
}
