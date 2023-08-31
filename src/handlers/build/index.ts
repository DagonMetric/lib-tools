import { ParsedBuildTask } from '../../helpers/index.js';
import { Logger } from '../../utils/index.js';

export default function (buildTask: ParsedBuildTask, logger: Logger): Promise<void> {
    logger.error(`Not Implemented. ${buildTask._taskName}`);

    return Promise.resolve();
}
