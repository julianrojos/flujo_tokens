/**
 * Capture Services
 *
 * Creates service layer for capture operations.
 * Provides unified interface for file I/O, Figma API, and markdown operations.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';

import { runJsonCommand } from '../utils/exec.js';
import { fetchFigmaFile, fetchFigmaImages, fetchFigmaNodes } from '../utils/figma-api.js';
import { writeTextAtomic, buildMarkdownSeed } from './capture-doc-scaffold.js';
import { renderEnrichedMarkdownSeed, extractComponentSpec } from '../utils/figma-node-spec-extractor.js';
import { injectExtractedSpecSectionsIntoMarkdown } from './capture-markdown-sections.js';
import type { PipelineContext } from './pipeline-context.js';

/**
 * Capture services interface.
 */
export interface CaptureServices {
  readComponentRegistry: () => unknown[];
  readSpecContents: () => Array<{ slug: string; content: string }>;
  readMarkdownContent: (path: string) => string;
  markdownExists: (path: string) => boolean;
  specExists: (path: string) => boolean;
  runScriptJson: (params: { scriptPath: string; scriptArgs: string[] }) => unknown;
  fetchFigmaFile: typeof fetchFigmaFile;
  fetchFigmaNodes: typeof fetchFigmaNodes;
  fetchFigmaImages: typeof fetchFigmaImages;
  writeTextAtomic: typeof writeTextAtomic;
  stderrWrite: (message: string) => void;
  renderEnrichedMarkdownSeed: typeof renderEnrichedMarkdownSeed;
  injectExtractedSpecSectionsIntoMarkdown: typeof injectExtractedSpecSectionsIntoMarkdown;
  buildMarkdownSeed: typeof buildMarkdownSeed;
  extractComponentSpec: typeof extractComponentSpec;
}

/**
 * Create capture services for pipeline context.
 */
export function createCaptureServices(params: { context: PipelineContext }): CaptureServices {
  const { context } = params;

  return {
    readComponentRegistry: () => {
      const p = context.paths.registryIndexPath;
      if (!fs.existsSync(p)) return [];
      try {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        return Array.isArray(parsed?.components) ? parsed.components : [];
      } catch {
        return [];
      }
    },
    readSpecContents: () => {
      const dir = context.paths.resolvedSpecRoot;
      if (!fs.existsSync(dir)) return [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith('.yml') && e.name !== '_template.yml')
        .map((e) => ({
          slug: path.basename(e.name, '.yml'),
          content: fs.readFileSync(path.join(dir, e.name), 'utf8'),
        }));
    },
    readMarkdownContent: (p: string) => fs.readFileSync(p, 'utf8'),
    markdownExists: (p: string) => fs.existsSync(p),
    specExists: (p: string) => fs.existsSync(p),
    runScriptJson: (params: { scriptPath: string; scriptArgs: string[] }) => {
      const scriptArgsList = Array.isArray(params.scriptArgs) ? [...params.scriptArgs] : [];
      const displayArgs = [...scriptArgsList];
      const tokenArgIndex = displayArgs.indexOf('--figma-token');
      if (tokenArgIndex >= 0 && tokenArgIndex + 1 < displayArgs.length) {
        displayArgs[tokenArgIndex + 1] = '***redacted***';
      }

      const result = runJsonCommand(process.execPath, [params.scriptPath, ...scriptArgsList], {
        cwd: context.repoRoot,
        displayArgs: [path.relative(context.repoRoot, params.scriptPath), ...displayArgs],
      });
      return result.data;
    },
    fetchFigmaFile: fetchFigmaFile,
    fetchFigmaNodes: fetchFigmaNodes,
    fetchFigmaImages: fetchFigmaImages,
    writeTextAtomic: writeTextAtomic,
    stderrWrite: (message: string) => process.stderr.write(message),
    renderEnrichedMarkdownSeed,
    injectExtractedSpecSectionsIntoMarkdown,
    buildMarkdownSeed,
    extractComponentSpec,
  };
}
