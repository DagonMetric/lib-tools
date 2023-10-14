import { BuildTask } from '../../build-task.js';
import { HandlerOptions } from '../../handler-options.js';

import { getCleanTaskRunner } from './clean/index.js';
import { getCopyTaskRunner } from './copy/index.js';
import { getScriptTaskRunner } from './script/index.js';
import { getStyleTaskRunner } from './style/index.js';

async function runBuildTaskCore(buildTask: Readonly<BuildTask>, options: Readonly<HandlerOptions>): Promise<void> {
    // Copy
    const copyTaskRunner = getCopyTaskRunner(buildTask, options);
    if (copyTaskRunner) {
        await copyTaskRunner.run();
    }

    // style
    const styleTaskRunner = getStyleTaskRunner(buildTask, options);
    if (styleTaskRunner) {
        await styleTaskRunner.run();
    }

    // script
    const scriptTaskRunner = getScriptTaskRunner(buildTask, options);
    if (scriptTaskRunner) {
        await scriptTaskRunner.run();
    }
}

/**
 * @internal
 */
export async function build(buildTask: Readonly<BuildTask>, options: Readonly<HandlerOptions>): Promise<void> {
    // Before clean
    const beforeCleanTaskRunner = getCleanTaskRunner('before', buildTask, options);
    if (beforeCleanTaskRunner) {
        await beforeCleanTaskRunner.run();
    }

    await runBuildTaskCore(buildTask, options);

    // After clean
    const afterCleanTaskRunner = getCleanTaskRunner('after', buildTask, options);
    if (afterCleanTaskRunner) {
        await afterCleanTaskRunner.run();
    }
}
