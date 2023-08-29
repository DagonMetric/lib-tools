import { ParsedBuildTask } from '../../helpers/index.js';
import { Logger } from '../../utils/index.js';

export function runBuildTask(buildTask: ParsedBuildTask, logger: Logger): Promise<void> {
    logger.error(`Not Implemented. ${buildTask._taskName}`);

    return Promise.resolve();
}
