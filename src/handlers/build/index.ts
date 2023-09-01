import { ParsedBuildTask } from '../../helpers/index.js';
import { Logger } from '../../utils/index.js';

import { getCleanTaskRunner } from './clean/index.js';
import { getCopyTaskRunner } from './copy/index.js';

export async function runBuildTask(buildTask: ParsedBuildTask, logger: Logger, dryRun: boolean): Promise<void> {
    // Copy
    const copyTaskRunner = getCopyTaskRunner(buildTask, logger, dryRun);
    if (copyTaskRunner) {
        const copiedPaths = await copyTaskRunner.run();
        if (copiedPaths.length) {
            logger.info(`Total ${copiedPaths.length} files are copied.`);
        }
    }
}

export default async function (buildTask: ParsedBuildTask, logger: Logger, dryRun = false): Promise<void> {
    // Before clean
    const beforeCleanTaskRunner = getCleanTaskRunner(buildTask, logger, 'before', dryRun);
    if (beforeCleanTaskRunner) {
        const cleandPaths = await beforeCleanTaskRunner.run();
        if (cleandPaths.length) {
            logger.info(`Total ${cleandPaths.length} files or directories are cleaned.`);
        }
    }

    await runBuildTask(buildTask, logger, dryRun);

    // After clean
    const afterCleanTaskRunner = getCleanTaskRunner(buildTask, logger, 'after', dryRun);
    if (afterCleanTaskRunner) {
        const cleandPaths = await afterCleanTaskRunner.run();
        if (cleandPaths.length) {
            logger.info(`Total ${cleandPaths.length} files or directories are cleaned.`);
        }
    }
}
