import { BuildTaskHandleContext } from '../interfaces/index.js';

import { getCleanTaskRunner } from './clean/index.js';
import { getCopyTaskRunner } from './copy/index.js';
import { getStyleTaskRunner } from './style/index.js';

export async function runBuildTask(context: BuildTaskHandleContext): Promise<void> {
    // Copy
    const copyTaskRunner = getCopyTaskRunner(context);
    if (copyTaskRunner) {
        context.logger.info('Running copy task.');
        const copyResult = await copyTaskRunner.run();
        context.logger.info(`Total ${copyResult.copiedFileInfoes.length} files are copied.`);
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
        const cleanResult = await beforeCleanTaskRunner.run();
        const cleanedDirsCount = cleanResult.cleanedPathInfoes.filter((pathInfo) => pathInfo.isDirectory).length;
        const cleanedFilesCount = cleanResult.cleanedPathInfoes.filter((pathInfo) => pathInfo.isFile).length;
        const fileSuffix = cleanedFilesCount > 1 ? 'files' : 'file';
        const dirSuffix = cleanedDirsCount > 1 ? 'directories' : 'directory';
        let cleanMsg = `otal ${cleanedFilesCount} ${fileSuffix} and ${cleanedDirsCount} ${dirSuffix} cleaned`;
        if (cleanResult.excludedPaths.length) {
            cleanMsg += `, ${cleanResult.excludedPaths.length} excluded`;
        }
        cleanMsg += '.';
        context.logger.info(cleanMsg);
    }

    await runBuildTask(context);

    // After clean
    const afterCleanTaskRunner = getCleanTaskRunner('after', context);
    if (afterCleanTaskRunner) {
        context.logger.info('Running after build clean task.');
        const cleanResult = await afterCleanTaskRunner.run();
        const cleanedDirsCount = cleanResult.cleanedPathInfoes.filter((pathInfo) => pathInfo.isDirectory).length;
        const cleanedFilesCount = cleanResult.cleanedPathInfoes.filter((pathInfo) => pathInfo.isFile).length;
        const fileSuffix = cleanedFilesCount > 1 ? 'files' : 'file';
        const dirSuffix = cleanedDirsCount > 1 ? 'directories' : 'directory';
        let cleanMsg = `otal ${cleanedFilesCount} ${fileSuffix} and ${cleanedDirsCount} ${dirSuffix} cleaned`;
        if (cleanResult.excludedPaths.length) {
            cleanMsg += `, ${cleanResult.excludedPaths.length} excluded`;
        }
        cleanMsg += '.';
        context.logger.info(cleanMsg);
    }
}
