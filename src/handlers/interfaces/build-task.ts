import { BuildTaskOptions } from '../../config-models/index.js';

import { TaskConfigInfo } from './task-config-info.js';

export interface BuildTask extends Omit<BuildTaskOptions, 'skip'>, TaskConfigInfo {
    readonly taskCategory: 'build';
    readonly taskName: 'build';
    readonly outDir: string;
}
