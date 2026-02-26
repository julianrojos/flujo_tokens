/**
 * Capture Services Factory
 *
 * Creates capture service instances for reading/writing registry, specs, and markdown.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { PipelineContext } from './pipeline-context.js';
import { writeTextAtomic, buildMarkdownSeed } from './capture-doc-scaffold.js';
import { renderEnrichedMarkdownSeed, extractComponentSpec } from '../utils/figma-node-spec-extractor.js';
import { injectExtractedSpecSectionsIntoMarkdown } from './capture-markdown-sections.js';

/**
 * Component registry row.
 */
export interface ComponentRegistryRow {
  slug?: string;
  figma?: {
    component_set_node_id?: string;
  };
  [key: string]: unknown;
}

/**
 * Capture services API.
 */
export interface CaptureServices {
  readComponentRegistry: () => ComponentRegistryRow[];
  readSpecContents: () => Array<{ slug: string; content: string }>;
  readMarkdownContent: (p: string) => string;
  markdownExists: (p: string) => boolean;
  specExists: (p: string) => boolean;
  runScriptJson: (params: {
    scriptPath: string;
    scriptArgs: string[];
  }) => unknown;
  writeTextAtomic: typeof writeTextAtomic;
  stderrWrite: (message: string) => void;
  renderEnrichedMarkdownSeed: typeof renderEnrichedMarkdownSeed;
  injectExtractedSpecSectionsIntoMarkdown: typeof injectExtractedSpecSectionsIntoMarkdown;
  buildMarkdownSeed: typeof buildMarkdownSeed;
  extractComponentSpec: typeof extractComponentSpec;
}

/**
 * Create capture services for a pipeline context.
 *
 * @param context - Pipeline context.
 * @returns Capture services API.
 */
export function createCaptureServices(context: PipelineContext): CaptureServices {
  const { repoRoot, paths } = context;
  const { registryIndexPath, resolvedSpecRoot } = paths;

  return {
    readComponentRegistry: (): ComponentRegistryRow[] => {
      const p = registryIndexPath;
      if (!fs.existsSync(p)) {
        return [];
      }

      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as {
          components?: ComponentRegistryRow[];
        };
        return Array.isArray(parsed?.components) ? parsed.components : [];
      } catch {
        return [];
      }
    },

    readSpecContents: (): Array<{ slug: string; content: string }> => {
      const dir = resolvedSpecRoot;
      if (!fs.existsSync(dir)) {
        return [];
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      return entries
        .filter(
          (e) =>
            e.isFile() &&
            e.name.endsWith('.yml') &&
            e.name !== '_template.yml',
        )
        .map((e) => ({
          slug: path.basename(e.name, '.yml'),
          content: fs.readFileSync(path.join(dir, e.name), 'utf8'),
        }));
    },

    readMarkdownContent: (p: string): string => {
      return fs.readFileSync(p, 'utf8');
    },

    markdownExists: (p: string): boolean => {
      return fs.existsSync(p);
    },

    specExists: (p: string): boolean => {
      return fs.existsSync(p);
    },

    runScriptJson: (params: {
      scriptPath: string;
      scriptArgs: string[];
    }): unknown => {
      throw new Error(
        'runScriptJson requires runJsonCommandFn implementation from deps',
      );
    },

    writeTextAtomic,

    stderrWrite: (message: string): void => {
      process.stderr.write(message);
    },

    renderEnrichedMarkdownSeed,

    injectExtractedSpecSectionsIntoMarkdown,

    buildMarkdownSeed,

    extractComponentSpec,
  };
}
