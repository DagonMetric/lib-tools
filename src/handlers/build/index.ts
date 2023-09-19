import { BuildTaskHandleContext } from '../interfaces/index.js';

import { getCleanTaskRunner } from './clean/index.js';
import { getCopyTaskRunner } from './copy/index.js';
import { getScriptTaskRunner } from './script/index.js';
import { getStyleTaskRunner } from './style/index.js';

async function runBuildTask(context: BuildTaskHandleContext): Promise<void> {
    // Copy
    const copyTaskRunner = getCopyTaskRunner(context);
    if (copyTaskRunner) {
        await copyTaskRunner.run();
    }

    // style
    const styleTaskRunner = getStyleTaskRunner(context);
    if (styleTaskRunner) {
        await styleTaskRunner.run();
    }

    // script
    const scriptTaskRunner = getScriptTaskRunner(context);
    if (scriptTaskRunner) {
        await scriptTaskRunner.run();
    }
}

export default async function (context: BuildTaskHandleContext): Promise<void> {
    // Before clean
    const beforeCleanTaskRunner = getCleanTaskRunner('before', context);
    if (beforeCleanTaskRunner) {
        await beforeCleanTaskRunner.run();
    }

    await runBuildTask(context);

    // After clean
    const afterCleanTaskRunner = getCleanTaskRunner('after', context);
    if (afterCleanTaskRunner) {
        await afterCleanTaskRunner.run();
    }
}
