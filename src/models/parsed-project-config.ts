import { ProjectConfig } from './project-config.js';

export interface ParsedProjectConfig extends ProjectConfig {
    _config: string;
    _workspaceRoot: string;
    _projectRoot: string;
    _projectName: string;
}
