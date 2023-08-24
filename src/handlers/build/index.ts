import { ParsedBuildTaskConfig } from '../../helpers/index.js';

export function runBuildTask(buildTask: ParsedBuildTaskConfig) {
    console.log(buildTask);

    return Promise.resolve();
}
