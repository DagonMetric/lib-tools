import { ParsedBuildTask } from '../../helpers/index.js';
import { Logger } from '../../utils/index.js';

import { getCleanTaskRunner } from './clean/index.js';

export default async function (buildTask: ParsedBuildTask, logger: Logger): Promise<void> {
    const beforeCleanTaskRunner = getCleanTaskRunner(buildTask, logger, 'before', false);
    if (beforeCleanTaskRunner) {
        const cleandPaths = await beforeCleanTaskRunner.run();
        if (cleandPaths.length) {
            logger.info(`Total ${cleandPaths.length} files or directories are cleaned.`);
        }
    }

    const afterCleanTaskRunner = getCleanTaskRunner(buildTask, logger, 'after', false);
    if (afterCleanTaskRunner) {
        const cleandPaths = await afterCleanTaskRunner.run();
        if (cleandPaths.length) {
            logger.info(`Total ${cleandPaths.length} files or directories are cleaned.`);
        }
    }
}
