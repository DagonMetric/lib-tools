import { OverridableTaskOptions, TaskBaseOptions } from '../../config-models/index.js';

function overrideConfig(oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>) {
    Object.keys(newConfig).forEach((key: string) => {
        oldConfig[key] = JSON.parse(JSON.stringify(newConfig[key])) as unknown;
    });
}

/**
 * @internal
 */
export function applyEnvOverrides<TTaskOptions extends TaskBaseOptions>(
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
