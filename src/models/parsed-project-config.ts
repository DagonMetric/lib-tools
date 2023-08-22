import { ProjectConfig } from './project-config.js';

export interface ParsedProjectConfig extends ProjectConfig {
    _workspaceRoot: string;
    _projectRoot: string;
    _projectName: string;
    _config: string | null;
}
