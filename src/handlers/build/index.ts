import { ParsedBuildTaskConfig } from '../../models/index.js';

export default function (buildTask: ParsedBuildTaskConfig) {
    console.log(buildTask);

    return Promise.resolve();
}
