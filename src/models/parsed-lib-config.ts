import { LibConfig } from './lib-config.js';

import { ParsedProjectConfig } from './parsed-project-config.js';

export interface ParsedLibConfig extends LibConfig {
    projects: Record<string, ParsedProjectConfig>;
}
