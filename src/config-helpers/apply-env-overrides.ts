import { OverridableTaskOptions, Task } from '../config-models/index.js';

export function applyEnvOverrides<TTaskOptions extends Task>(
    taskConfig: OverridableTaskOptions<TTaskOptions>,
    envNames: string[]
): void {
    if (!taskConfig.envOverrides || !envNames.length) {
        return;
    }

    const envOverridesConfig = taskConfig.envOverrides;
    const normalizedEnvNames = envNames
        .map((envName) => envName.toLowerCase())
        .filter((value, index, array) => array.indexOf(value) === index);

    const overrideConfig = (oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>) => {
        Object.keys(newConfig).forEach((key: string) => {
            oldConfig[key] = JSON.parse(JSON.stringify(newConfig[key])) as unknown;
        });
    };

    Object.keys(envOverridesConfig)
        .filter((envName) => normalizedEnvNames.includes(envName.toLowerCase()))
        .forEach((envName: string) => {
            const newConfig = envOverridesConfig[envName];
            if (newConfig && typeof newConfig === 'object') {
                overrideConfig(taskConfig as Record<string, unknown>, newConfig);
            }
        });
}
