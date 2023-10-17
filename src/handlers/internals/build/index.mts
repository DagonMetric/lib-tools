/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/dagonmetric/lib-tools
 ****************************************************************************************** */
import { BuildTask } from '../../build-task.mjs';
import { HandlerOptions } from '../../handler-options.mjs';

import { getCleanTaskRunner } from './clean/index.mjs';
import { getCopyTaskRunner } from './copy/index.mjs';
import { getScriptTaskRunner } from './script/index.mjs';
import { getStyleTaskRunner } from './style/index.mjs';

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
