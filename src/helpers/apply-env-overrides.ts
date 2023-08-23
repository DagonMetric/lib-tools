import { OverridableTaskConfig } from '../models/index.js';

function overrideActionConfig(oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): void {
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

    const envNames: string[] = [];

    if (env.production || env.prod) {
        if (!envNames.includes('prod')) {
            envNames.push('prod');
        }
        if (!envNames.includes('production')) {
            envNames.push('production');
        }
    } else if (env.dev || env.development) {
        envNames.push('dev');
        envNames.push('development');
    }

    const preDefinedKeys = ['prod', 'production', 'dev', 'development'];

    Object.keys(env)
        .filter((key) => !preDefinedKeys.includes(key.toLowerCase()) && !envNames.includes(key) && env[key])
        .forEach((key) => {
            envNames.push(key);
        });

    Object.keys(taskConfig.envOverrides).forEach((taskTargetKey: string) => {
        const targets = taskTargetKey.split(',');
        targets.forEach((t) => {
            t = t.trim();
            if (targets.indexOf(t) > -1 && taskConfig.envOverrides) {
                const newConfig = taskConfig.envOverrides[t];
                if (newConfig && typeof newConfig === 'object') {
                    overrideActionConfig(taskConfig as Record<string, unknown>, newConfig);
                }
            }
        });
    });
}
