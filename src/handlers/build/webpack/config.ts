import { Configuration } from 'webpack';

import { BuildCommandOptions } from '../../../models/index.js';

export async function getWebpackConfigsForBuildTasks(
    env?: Record<string, boolean | string>,
    argv?: BuildCommandOptions
): Promise<Configuration[]> {
    return await Promise.resolve([]);
}
