import { OverridableTaskConfig } from '../models/index.js';

function overrideConfig(oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): void {
    Object.keys(newConfig)
        .filter((key: string) => key !== 'envOverrides')
        .forEach((key: string) => {
            oldConfig[key] = JSON.parse(JSON.stringify(newConfig[key])) as unknown;
        });
}

export function applyEnvOverrides<TTaskConfigBase>(
    taskConfig: OverridableTaskConfig<TTaskConfigBase>,
    env: Record<string, boolean>
): void {
    if (!taskConfig.envOverrides || !Object.keys(taskConfig.envOverrides).length) {
        return;
    }

    const envNames = Object.keys(env);

    Object.keys(taskConfig.envOverrides)
        .filter((configName) => envNames.includes(configName))
        .forEach((configName: string) => {
            const newConfig = taskConfig.envOverrides?.[configName];
            if (newConfig && typeof newConfig === 'object') {
                overrideConfig(taskConfig as Record<string, unknown>, newConfig);
            }
        });
}
