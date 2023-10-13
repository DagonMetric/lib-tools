import { BuildTask, HandlerContext } from '../interfaces/index.js';

import { getCleanTaskRunner } from './clean/index.js';
import { getCopyTaskRunner } from './copy/index.js';
import { getScriptTaskRunner } from './script/index.js';
import { getStyleTaskRunner } from './style/index.js';

async function runBuildTaskCore(buildTask: Readonly<BuildTask>, context: Readonly<HandlerContext>): Promise<void> {
    // Copy
    const copyTaskRunner = getCopyTaskRunner(buildTask, context);
    if (copyTaskRunner) {
        await copyTaskRunner.run();
    }

    // style
    const styleTaskRunner = getStyleTaskRunner(buildTask, context);
    if (styleTaskRunner) {
        await styleTaskRunner.run();
    }

    // script
    const scriptTaskRunner = getScriptTaskRunner(buildTask, context);
    if (scriptTaskRunner) {
        await scriptTaskRunner.run();
    }
}

/**
 * @internal
 */
export async function build(buildTask: Readonly<BuildTask>, context: Readonly<HandlerContext>): Promise<void> {
    // Before clean
    const beforeCleanTaskRunner = getCleanTaskRunner('before', buildTask, context);
    if (beforeCleanTaskRunner) {
        await beforeCleanTaskRunner.run();
    }

    await runBuildTaskCore(buildTask, context);

    // After clean
    const afterCleanTaskRunner = getCleanTaskRunner('after', buildTask, context);
    if (afterCleanTaskRunner) {
        await afterCleanTaskRunner.run();
    }
}
