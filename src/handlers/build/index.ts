import { BuildTaskHandleContext } from '../interfaces/index.js';

import { getCleanTaskRunner } from './clean/index.js';
import { getCopyTaskRunner } from './copy/index.js';
import { getStyleTaskRunner } from './style/index.js';

export async function runBuildTask(context: BuildTaskHandleContext): Promise<void> {
    // Copy
    const copyTaskRunner = getCopyTaskRunner(context);
    if (copyTaskRunner) {
        context.logger.info('Running copy task.');
        const copiedPaths = await copyTaskRunner.run();
        context.logger.info(`Total ${copiedPaths.length} files are copied.`);
    }

    // style
    const styleTaskRunner = getStyleTaskRunner(context);
    if (styleTaskRunner) {
        context.logger.info('Running style task.');
        await styleTaskRunner.run();
    }
}

export default async function (context: BuildTaskHandleContext): Promise<void> {
    // Before clean
    const beforeCleanTaskRunner = getCleanTaskRunner('before', context);
    if (beforeCleanTaskRunner) {
        context.logger.info('Running before build clean task.');
        const cleandPaths = await beforeCleanTaskRunner.run();
        context.logger.info(`Total ${cleandPaths.length} files / directories are cleaned.`);
    }

    await runBuildTask(context);

    // After clean
    const afterCleanTaskRunner = getCleanTaskRunner('after', context);
    if (afterCleanTaskRunner) {
        context.logger.info('Running after build clean task.');
        const cleandPaths = await afterCleanTaskRunner.run();
        context.logger.info(`Total ${cleandPaths.length} files / directories are cleaned.`);
    }
}
