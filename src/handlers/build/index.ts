import { ParsedBuildTask } from '../../helpers/index.js';
import { CleanOptions } from '../../models/index.js';
import { Logger } from '../../utils/index.js';

import { CleanTaskHandler } from './clean/index.js';

export default async function (buildTask: ParsedBuildTask, logger: Logger): Promise<void> {
    const beforeCleanTaskHanlder = getCleanTaskHandler(buildTask, logger, true);
    if (beforeCleanTaskHanlder) {
        await beforeCleanTaskHanlder.run();
    }

    const afterCleanTaskHanlder = getCleanTaskHandler(buildTask, logger, false);
    if (afterCleanTaskHanlder) {
        await afterCleanTaskHanlder.run();
    }
}

function getCleanTaskHandler(
    buildTask: ParsedBuildTask,
    logger: Logger,
    forBeforeBuild: boolean
): CleanTaskHandler | null {
    if (!buildTask.clean) {
        return null;
    }
    if (forBeforeBuild) {
        if (
            typeof buildTask.clean === 'object' &&
            (!buildTask.clean.beforeBuild ||
                (!buildTask.clean.beforeBuild.cleanOutDir &&
                    (!buildTask.clean.beforeBuild.paths ||
                        (buildTask.clean.beforeBuild.paths && !buildTask.clean.beforeBuild.paths.length))))
        ) {
            return null;
        }
        const cleanOptions =
            typeof buildTask.clean === 'object'
                ? buildTask.clean
                : ({
                      beforeBuild: {
                          cleanOutDir: true
                      }
                  } as CleanOptions);

        const beforeBuildCleanOptions = cleanOptions.beforeBuild ?? {};

        const cleanTaskHandler = new CleanTaskHandler({
            forBeforeBuildClean: true,
            beforeOrAfterCleanOptions: beforeBuildCleanOptions,
            workspaceInfo: buildTask._workspaceInfo,
            outDir: buildTask._outDir,
            allowOutsideWorkspaceRoot: cleanOptions.allowOutsideWorkspaceRoot ? true : false,
            allowOutsideOutDir: cleanOptions.allowOutsideOutDir ? true : false,
            logger
        });

        return cleanTaskHandler;
    } else if (typeof buildTask.clean === 'object' && buildTask.clean.afterBuild?.paths?.length) {
        const cleanOptions = buildTask.clean;
        const afterBuildCleanOptions = cleanOptions.afterBuild ?? {};

        const cleanTaskHandler = new CleanTaskHandler({
            forBeforeBuildClean: false,
            beforeOrAfterCleanOptions: afterBuildCleanOptions,
            workspaceInfo: buildTask._workspaceInfo,
            outDir: buildTask._outDir,
            allowOutsideWorkspaceRoot: cleanOptions.allowOutsideWorkspaceRoot ? true : false,
            allowOutsideOutDir: cleanOptions.allowOutsideOutDir ? true : false,
            logger
        });

        return cleanTaskHandler;
    }

    return null;
}
