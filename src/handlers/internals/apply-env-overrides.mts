/** *****************************************************************************************
 * @license
 * Copyright (c) DagonMetric. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/DagonMetric/lib-tools/blob/main/LICENSE
 ****************************************************************************************** */
import { TaskOptions } from '../../config-models/index.mjs';
import { OverridableTaskOptions } from '../../config-models/overridable-task-options.mjs';

function overrideConfig(oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>) {
    Object.keys(newConfig).forEach((key: string) => {
        oldConfig[key] = JSON.parse(JSON.stringify(newConfig[key])) as unknown;
    });
}

export function applyEnvOverrides<TTaskOptions extends TaskOptions>(
    taskConfig: OverridableTaskOptions<TTaskOptions>,
    envNames: readonly string[]
): void {
    if (!taskConfig.envOverrides || !envNames.length) {
        return;
    }

    const envOverridesConfig = taskConfig.envOverrides;
    const normalizedEnvNames = envNames
        .map((envName) => envName.toLowerCase())
        .filter((value, index, array) => array.indexOf(value) === index);

    Object.keys(envOverridesConfig)
        .filter((envName) => normalizedEnvNames.includes(envName.toLowerCase()))
        .forEach((envName: string) => {
            const newConfig = envOverridesConfig[envName];
            if (newConfig && typeof newConfig === 'object') {
                overrideConfig(taskConfig as Record<string, unknown>, newConfig);
            }
        });
}
