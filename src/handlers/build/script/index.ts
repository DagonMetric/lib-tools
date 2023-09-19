import { ScriptOptions } from '../../../config-models/index.js';
import { PackageJsonInfo, WorkspaceInfo } from '../../../config-models/parsed/index.js';
import { LogLevelStrings, Logger, LoggerBase, colors } from '../../../utils/index.js';

import { BuildTaskHandleContext } from '../../interfaces/index.js';

export interface ScriptTaskRunnerOptions {
    readonly workspaceInfo: WorkspaceInfo;
    readonly outDir: string;
    readonly dryRun: boolean | undefined;
    readonly logger: LoggerBase;
    readonly logLevel: LogLevelStrings;
    readonly packageJsonInfo: PackageJsonInfo | null;
    readonly bannerText: string | null;
    readonly env: string | undefined;
}

export interface ScriptBundleResult {
    readonly builtAssets: { path: string; size: number; emitted: boolean }[];
    readonly time: number;
}

export class ScriptTaskRunner {
    private readonly logger: LoggerBase;

    constructor(readonly options: ScriptTaskRunnerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<ScriptBundleResult> {
        this.logger.group('\u25B7 script');

        const result = await Promise.resolve({
            builtAssets: [],
            time: 0
        });

        this.logger.groupEnd();
        this.logger.info(`${colors.lightGreen('\u25B6')} script [${colors.lightGreen(`${result.time} ms`)}]`);

        return result;
    }
}

export function getScriptTaskRunner(context: BuildTaskHandleContext): ScriptTaskRunner | null {
    const buildTask = context.taskOptions;

    if (!buildTask.script) {
        return null;
    }

    let scriptOptions: ScriptOptions = {
        bundles: []
    };

    if (Array.isArray(buildTask.script)) {
        for (const scriptFile of buildTask.script) {
            scriptOptions.bundles.push({
                entry: scriptFile
            });
        }
    } else {
        scriptOptions = buildTask.script;
    }

    if (!scriptOptions.bundles.filter((b) => b.entry?.trim().length).length) {
        return null;
    }

    const taskRunner = new ScriptTaskRunner({
        workspaceInfo: buildTask._workspaceInfo,
        outDir: buildTask._outDir,
        dryRun: context.dryRun,
        logLevel: context.logLevel ?? 'info',
        logger:
            context.logger ??
            new Logger({
                logLevel: context.logLevel ?? 'info',
                warnPrefix: colors.lightYellow('Warning:'),
                groupIndentation: 4
            }),
        env: context.env,
        packageJsonInfo: buildTask._packageJsonInfo,
        bannerText: buildTask._bannerText
    });

    return taskRunner;
}
