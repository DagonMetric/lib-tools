import { ParsedBuildTaskConfig } from '../../helpers/index.js';
import { Logger } from '../../utils/index.js';

export function runBuildTask(buildTaskConfig: ParsedBuildTaskConfig, logger: Logger): Promise<void> {
    logger.error(`Not Implemented. ${buildTaskConfig.taskName}`);

    return Promise.resolve();
}
