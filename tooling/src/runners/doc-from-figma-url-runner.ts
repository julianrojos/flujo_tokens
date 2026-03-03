#!/usr/bin/env node

/**
 * Doc from Figma URL Runner
 *
 * Generate one component markdown from a Figma URL using an agent CLI.
 * TypeScript runner for ds-doc-from-figma-url script.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { isMain } from '../utils/is-main.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';
import { TempArtifactManager } from '../services/temp-artifacts.js';
import {
  buildAgentPrompt,
  canonicalH2ConstraintLines,
  RULE_BLOCKS,
} from '../utils/prompts.js';
import { GOLDEN_COMPONENT_DOC_SAMPLE_PATH } from '../utils/doc-templates.js';
import { captureFileSnapshot, restoreFileSnapshot } from '../utils/file-snapshot.js';
import { assertScopedWritePolicy } from '../utils/scoped-write-guard.js';
import { logger } from '../utils/logger.js';
import { resolveDocContext } from '../services/doc-from-figma-url-context.js';
import { runDocGenerationPipeline } from '../services/doc-from-figma-url-pipeline.js';
import { handleDiscoveryMode } from '../services/doc-from-figma-url-discovery.js';
import { parseFigmaFileUrl } from '../services/figma-component-map.js';
import { parseFigmaUrl } from '../utils/figma-url-parser.js';
import { parseBooleanOption } from '../utils/parse-options.js';

const USAGE = {
  command:
    'npm run ds:doc-from-figma-url -- --url "https://www.figma.com/design/..." [--component-name Button] [--output docs/components/button.md] [--agent codex]',
  description:
    'Generate one component markdown from a Figma URL using an agent CLI.',
  options: [
    {
      name: '--url <figma-url>',
      description:
        'Figma component URL (with node-id) or file URL (without node-id for discovery mode).',
      required: true,
    },
    {
      name: '--component-name <name>',
      description:
        'Display name hint for H1 and output naming (required when --output is omitted).',
    },
    {
      name: '--figma-token <token>',
      description:
        'Figma PAT for file-level component discovery. Falls back to FIGMA_TOKEN env var.',
    },
    {
      name: '--auto-component-map <true|false>',
      description:
        'When URL has no node-id, auto-generate component map and exit with next steps.',
      defaultValue: 'true',
    },
    {
      name: '--component-map-out <path>',
      description:
        'Optional output path for file-level component map JSON (only used for URL without node-id).',
    },
    {
      name: '--output <path>',
      description: 'Optional markdown output path.',
    },
    {
      name: '--docs-root <path>',
      description: 'Docs root or docs/components directory.',
      defaultValue: 'docs/components',
    },
    {
      name: '--agent <codex|claude|gemini|auto>',
      description: 'Agent CLI used for generation.',
      defaultValue: 'auto',
    },
    {
      name: '--allow-doc-status-change <true|false>',
      description:
        'Allow doc_status changes in frontmatter (requires --force true).',
      defaultValue: 'false',
    },
    {
      name: '--capture-proof <true|false>',
      description:
        'Capture visual proof automatically after markdown generation.',
      defaultValue: 'true',
    },
    {
      name: '--capture-proof-strict <true|false>',
      description:
        'Fail when automatic visual proof capture fails.',
      defaultValue: 'false',
    },
    {
      name: '--capture-proof-variants <true|false>',
      description:
        'Capture variant screenshots alongside main visual proof.',
      defaultValue: 'true',
    },
    {
      name: '--capture-proof-variant-limit <number>',
      description:
        'Max number of variants to capture per component.',
      defaultValue: '6',
    },
    {
      name: '--force <true|false>',
      description: 'Required when allowing doc_status changes.',
      defaultValue: 'false',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

const FRONTMATTER_EVIDENCE_PREFIXES = Object.freeze([
  'figma.file_url',
  'figma.page',
  'figma.component',
  'figma.component_set_node_id',
  'figma.last_verified',
  'figma.component_hash',
  'figma.properties_count',
  'figma.variants_count',
  'pipeline.ds_component_doc',
]);

/**
 * Doc from Figma URL arguments.
 */
export interface DocFromFigmaUrlArgs {
  url?: string;
  'component-name'?: string;
  'figma-token'?: string;
  'auto-component-map'?: string;
  'component-map-out'?: string;
  output?: string;
  'docs-root'?: string;
  agent?: string;
  'allow-doc-status-change'?: string;
  'capture-proof'?: string;
  'capture-proof-strict'?: string;
  'capture-proof-variants'?: string;
  'capture-proof-variant-limit'?: string;
  force?: string;
  system?: string;
  help?: boolean | string;
}

/**
 * Main doc generation function.
 */
export async function runDocFromFigmaUrl(
  args: DocFromFigmaUrlArgs = {},
): Promise<void> {
  const tempArtifacts = new TempArtifactManager();
  tempArtifacts.attachProcessHooks();

  if (String(args.help || 'false') === 'true') {
    printUsage(USAGE, { exitCode: 0 });
  }

  const figmaUrl = args.url;
  if (!figmaUrl) {
    printUsage(USAGE, { stream: 'stderr' as const, exitCode: 1 });
  }
  const autoComponentMap = parseBooleanOption(
    args['auto-component-map'],
    '--auto-component-map',
    true,
  );

  const systemCtx = resolveSystemContextSafe({ system: args.system });

  const docsRoot = args['docs-root'] || systemCtx.paths.docs;
  const docsRootResolved = path.resolve(docsRoot);
  const componentDocsDir =
    path.basename(docsRootResolved) === 'components'
      ? docsRootResolved
      : path.join(docsRootResolved, 'components');
  const docsRootDir =
    path.basename(docsRootResolved) === 'components'
      ? path.dirname(docsRootResolved)
      : docsRootResolved;

  // Parse URL to determine if it's a file-level or component-level URL
  const figmaFileDescriptor = parseFigmaFileUrl(figmaUrl);
  const figmaUrlParsed = parseFigmaUrl(figmaUrl);
  const figmaMapOutPath = args['component-map-out']
    ? path.resolve(args['component-map-out'])
    : path.join(
        docsRootDir,
        '_generated',
        'figma-component-map',
        `${figmaFileDescriptor.fileKey}.json`,
      );
  const figmaToken = String(args['figma-token'] || process.env.FIGMA_TOKEN || '').trim();
  const isFileLevelUrl = !figmaUrlParsed.nodeId;

  if (isFileLevelUrl) {
    if (!autoComponentMap) {
      throw new Error(
        'Figma URL has no node-id and automatic file component mapping is disabled.\n' +
          'Either pass a component URL with node-id, or enable --auto-component-map true.',
      );
    }
    if (!figmaToken) {
      throw new Error(
        'Figma file URL detected (no node-id), but no API token is available.\n' +
          'Provide --figma-token <token> or set FIGMA_TOKEN to auto-discover component URLs.',
      );
    }

    await handleDiscoveryMode(
      figmaFileDescriptor,
      figmaUrl,
      figmaToken,
      figmaMapOutPath,
      docsRootDir,
    );
    return;
  }

  // Resolve doc context
  const ctx = resolveDocContext(
    args,
    figmaFileDescriptor,
    figmaUrl,
    figmaToken,
    figmaMapOutPath,
    docsRootDir,
    componentDocsDir,
    tempArtifacts,
  );

  // Build agent prompt
  const prompt = buildAgentPrompt({
    context: [
      'Generate one component documentation markdown from Figma.',
      ctx.componentName ? `Expected component name: ${ctx.componentName}` : '',
    ],
    sources: [
      `Figma URL: ${ctx.figmaUrl}`,
      ctx.styleReferencePath
        ? `Existing docs style reference: ${ctx.styleReferencePath}`
        : '',
      `Canonical markdown skeleton (fill-only): ${ctx.skeletonPath}`,
      `Golden markdown example for tone/detail: ${GOLDEN_COMPONENT_DOC_SAMPLE_PATH}`,
      `Output path (required): ${ctx.outputPath}`,
    ],
    constraints: [
      RULE_BLOCKS.FIGMA_MCP_WORKFLOW,
      RULE_BLOCKS.DOCUMENTATION_ONLY,
      ...canonicalH2ConstraintLines(),
      'Use the skeleton file as the source layout: keep all H2 headings and table columns unchanged.',
      'Fill placeholders with concrete content, but do not add or remove H2 sections.',
      'Do not invent properties, variants, states, or token semantics.',
      RULE_BLOCKS.NO_INTERNAL_IDS,
      'Figma node IDs are allowed for source traceability (for example in `node-id` URLs).',
      'Include component metadata/frontmatter expected by project rules.',
      'Do not document system_cover or non-component pages.',
    ],
    examples: [
      'GOOD token reference: `Semantic.Color.Text.Neutral.Default` (#121212).',
      'BAD token reference: VariableID:123:456.',
      'GOOD unresolved marker: `TBD`.',
      'BAD unresolved markers: `pending` or `unknown`.',
      'GOOD H2 order: canonical sections only, no extra H2 headings.',
    ],
    expectedOutput: [
      'Write/update the markdown file in the repo.',
      'Return a short report with: final path, doc_status value, and unresolved TBD count.',
    ],
  });
  const outputSnapshot = captureFileSnapshot(ctx.outputPath);

  try {
    await runDocGenerationPipeline(ctx, prompt, outputSnapshot);
  } catch (error) {
    restoreFileSnapshot(ctx.outputPath, outputSnapshot);
    let scopeMessage = '';
    try {
      assertScopedWritePolicy({
        snapshot: ctx.scopeSnapshot,
        allowedPaths: ctx.allowedWritePaths,
        label: 'ds-doc-from-figma-url',
      });
    } catch (scopeError) {
      scopeMessage = `\n${scopeError instanceof Error ? scopeError.message : String(scopeError)}`;
    }
    logger.error(
      `${error instanceof Error ? error.message : String(error)}${scopeMessage}`,
    );
    process.exit(1);
  }
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args) as DocFromFigmaUrlArgs;
  runDocFromFigmaUrl(parsed).catch((error) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
