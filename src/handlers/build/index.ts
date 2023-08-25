import { ParsedBuildTaskConfig } from '../../helpers/index.js';
import { Logger } from '../../utils/index.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function runBuildTask(buildTaskConfig: ParsedBuildTaskConfig, logger: Logger): Promise<void> {
    logger.error('Not Implemented.', JSON.stringify(buildTaskConfig));

    return Promise.resolve();
}
