import { ParsedBuildTask } from '../../helpers/index.js';
import { Logger } from '../../utils/index.js';

import { getCleanTaskRunner } from './clean/index.js';
import { getCopyTaskRunner } from './copy/index.js';

export async function runBuildTask(buildTask: ParsedBuildTask, logger: Logger, dryRun: boolean): Promise<void> {
    // Copy
    const copyTaskRunner = getCopyTaskRunner(buildTask, logger, dryRun);
    if (copyTaskRunner) {
        logger.info('Running copy task.');
        const copiedPaths = await copyTaskRunner.run();
        logger.info(`Total ${copiedPaths.length} files are copied.`);
    }
}

export default async function (buildTask: ParsedBuildTask, logger: Logger, dryRun = false): Promise<void> {
    // Before clean
    const beforeCleanTaskRunner = getCleanTaskRunner('before', buildTask, logger, dryRun);
    if (beforeCleanTaskRunner) {
        logger.info('Running before build clean task.');
        const cleandPaths = await beforeCleanTaskRunner.run();
        logger.info(`Total ${cleandPaths.length} files / directories are cleaned.`);
    }

    await runBuildTask(buildTask, logger, dryRun);

    // After clean
    const afterCleanTaskRunner = getCleanTaskRunner('after', buildTask, logger, dryRun);
    if (afterCleanTaskRunner) {
        logger.info('Running after build clean task.');
        const cleandPaths = await afterCleanTaskRunner.run();
        logger.info(`Total ${cleandPaths.length} files / directories are cleaned.`);
    }
}
