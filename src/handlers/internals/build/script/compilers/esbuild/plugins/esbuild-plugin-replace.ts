import { Plugin } from 'esbuild';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { LoggerBase, isSamePath, normalizePathToPOSIXStyle } from '../../../../../../../utils/index.mjs';

export interface SubstitutionEntry {
  searchPattern: RegExp;
  replaceValue: string;
  files: string[] | undefined;
}

export interface EsBuildPluginReplaceOptions {
  substitutions: SubstitutionEntry[];
  include?: RegExp;
  logger: LoggerBase;
}

export function replace(pptions: EsBuildPluginReplaceOptions): Plugin {
  const { include, substitutions, logger } = pptions;

  return {
    name: 'replace',
    setup(build) {
      build.onLoad({ filter: include ?? /.*/ }, async (args) => {
        let source: string | undefined;
        let replaced = false;

        for (const substitution of substitutions) {
          if (substitution.files && !substitution.files.some((p) => isSamePath(p, args.path))) {
            continue;
          }

          source = await fs.readFile(args.path, 'utf-8');

          const m = source.match(substitution.searchPattern);
          if (m != null && m.length > 0) {
            const matchedText = m[0];
            const filePathRel = normalizePathToPOSIXStyle(path.relative(process.cwd(), args.path));

            logger.debug(
              `Substituting '${matchedText}' with value '${substitution.replaceValue}' in file ${filePathRel}`
            );

            source = source.replace(substitution.searchPattern, substitution.replaceValue);
            replaced = true;
          }
        }

        if (!replaced) {
          return;
        }

        return { source, loader: 'default' };
      });
    }
  };
}
