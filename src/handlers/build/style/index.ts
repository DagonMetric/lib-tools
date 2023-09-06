import { StyleOptions } from '../../../models/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../../../models/parsed/index.js';
import { Logger } from '../../../utils/index.js';

export interface StyleTaskRunnerOptions {
    readonly logger: Logger;
    readonly styleOptions: StyleOptions;
    readonly workspaceInfo: WorkspaceInfo;
    readonly outDir: string;
    readonly dryRun: boolean;
}

export class StyleTaskRunner {
    private readonly logger: Logger;

    constructor(readonly options: StyleTaskRunnerOptions) {
        this.logger = this.options.logger;
    }

    async run(): Promise<string[]> {
        this.logger.info('TODO:');
        return Promise.resolve([]);
    }
}

export function getStyleTaskRunner(buildTask: ParsedBuildTask, logger: Logger, dryRun = false): StyleTaskRunner | null {
    if (!buildTask.style) {
        return null;
    }

    let styleOptions: StyleOptions = {
        bundles: []
    };

    if (Array.isArray(buildTask.style)) {
        for (const styleFile of buildTask.style) {
            styleOptions.bundles.push({
                entry: styleFile
            });
        }
    } else {
        styleOptions = buildTask.style;
    }

    if (!styleOptions.bundles.filter((b) => b.entry?.trim().length).length) {
        return null;
    }

    const copyTaskRunner = new StyleTaskRunner({
        styleOptions,
        dryRun,
        workspaceInfo: buildTask._workspaceInfo,
        outDir: buildTask._outDir,
        logger
    });

    return copyTaskRunner;
}
