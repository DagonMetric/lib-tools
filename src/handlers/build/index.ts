import { ParsedBuildTaskConfig } from '../../models/index.js';

export function runBuildTask(buildTask: ParsedBuildTaskConfig) {
    console.log(buildTask);

    return Promise.resolve();
}
