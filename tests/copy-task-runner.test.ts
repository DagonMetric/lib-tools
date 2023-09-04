import * as assert from 'node:assert';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { getCopyTaskRunner } from '../src/handlers/build/copy/index.js';
import { ParsedBuildTask, WorkspaceInfo } from '../src/helpers/index.js';
import { Logger } from '../src/utils/index.js';

void describe('getCopyTaskRunner', () => {
    const workspaceRoot = path.resolve(process.cwd(), 'tests/test-data/copy-project');
    const workspaceInfo: WorkspaceInfo = {
        workspaceRoot,
        projectRoot: workspaceRoot,
        projectName: 'copy-project',
        configPath: null
    };

    void it('should not get runner when empty copy entry', () => {
        const buildTask: ParsedBuildTask = {
            _taskName: 'build',
            _workspaceInfo: workspaceInfo,
            _outDir: path.resolve(workspaceRoot, 'theout'),
            _packageJsonInfo: null,
            copy: []
        };

        const runner = getCopyTaskRunner(buildTask, new Logger({ logLevel: 'error' }));

        assert.equal(runner, null);
    });
});
