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
import { resolveSystemContextSafe, PROJECT_ROOT } from '../utils/system-context.js';
import { runAgentPrompt } from '../services/agent-runner.js';
import { parseMarkdownFrontmatter } from '../utils/parse-frontmatter.js';
import {
  normalizeComponentName,
  componentNameToSnakeCase,
} from '../utils/component-name.js';
import { resolveStyleReferencePath } from '../utils/style-reference.js';
import { normalizeAgentOutputFile } from '../services/agent-output-normalizer.js';
import {
  GOLDEN_COMPONENT_DOC_SAMPLE_PATH,
  writeComponentDocSkeleton,
} from '../utils/doc-templates.js';
import {
  validateAgentOutputContract,
  writeAgentOutputErrorReport,
} from '../utils/agent-output-contract.js';
import { updateAgentDriftBaseline } from '../services/agent-drift-detector.js';
import {
  buildAgentPrompt,
  canonicalH2ConstraintLines,
  RULE_BLOCKS,
} from '../utils/prompts.js';
import { formatMarkdownTarget } from '../utils/format-markdown.js';
import {
  captureFileSnapshot,
  restoreFileSnapshot,
} from '../utils/file-snapshot.js';
import {
  assertDocStatusStable,
  assertEvidenceGatedScalarChanges,
} from '../utils/evidence-gated-mutations.js';
import {
  assertScopedWritePolicy,
  captureScopedWriteSnapshot,
} from '../utils/scoped-write-guard.js';
import { runOrThrow } from '../utils/exec.js';
import { syncDocumentationIndices } from '../services/component-registry-index.js';
import { TempArtifactManager } from '../services/temp-artifacts.js';
import { fetchFigmaFile } from '../utils/figma-api.js';
import {
  buildFigmaComponentMap,
  buildFigmaComponentMapSummary,
  parseFigmaFileUrl,
  type FigmaComponentMap,
  type ParsedFigmaFileUrl,
} from '../utils/figma-component-map.js';
import { parseFigmaUrl } from '../utils/figma-url-parser.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { logger } from '../utils/logger.js';

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
 * Parse boolean option with validation.
 */
function parseBooleanOption(
  rawValue: string | undefined,
  optionName: string,
  fallback = false,
): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

/**
 * Parse positive number with validation.
 */
function parsePositiveNumber(
  rawValue: string | undefined,
  optionName: string,
  fallback: number,
): number {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${optionName} value: ${rawValue}. Expected a positive number.`);
  }
  return parsed;
}

/**
 * Parse and validate agent type.
 */
function parseAgentType(rawValue: string | undefined, optionName: string): 'codex' | 'claude' | 'gemini' | 'auto' {
  const agent = String(rawValue || 'auto').trim().toLowerCase() as 'codex' | 'claude' | 'gemini' | 'auto';
  const validAgents: Array<'codex' | 'claude' | 'gemini' | 'auto'> = ['codex', 'claude', 'gemini', 'auto'];
  if (!validAgents.includes(agent)) {
    throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: codex, claude, gemini, auto.`);
  }
  return agent;
}

/**
 * Write JSON file atomically.
 */
function writeJsonFileAtomic(filePath: string, payload: unknown): string {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, resolved);
  return resolved;
}

/**
 * Render component URL suggestions from component map.
 */
function renderComponentUrlSuggestions(
  componentMap: Record<string, unknown>,
  maxItems = 20,
): string {
  const rows = Array.isArray(componentMap?.component_urls)
    ? (componentMap.component_urls as Record<string, string>[])
    : [];
  return rows
    .slice(0, Math.max(1, Math.floor(maxItems)))
    .map((row) => `- ${row.kind} | ${row.name} | ${row.url}`)
    .join('\n');
}

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

  const ctx = resolveSystemContextSafe({ system: args.system });

  const docsRoot = args['docs-root'] || ctx.paths.docs;
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
  const fileMapDefaultPath = path.join(
    docsRootDir,
    '_generated',
    'figma-component-map',
    `${figmaFileDescriptor.fileKey}.json`,
  );
  const figmaMapOutPath = args['component-map-out']
    ? path.resolve(args['component-map-out'])
    : fileMapDefaultPath;
  const figmaToken = String(args['figma-token'] || process.env.FIGMA_TOKEN || '').trim();
  const isFileLevelUrl = !figmaUrlParsed.nodeId;

  if (isFileLevelUrl) {
    if (!autoComponentMap) {
      logger.error(
        'Figma URL has no node-id and automatic file component mapping is disabled.\n' +
          'Either pass a component URL with node-id, or enable --auto-component-map true.',
      );
      process.exit(1);
    }
    if (!figmaToken) {
      logger.error(
        'Figma file URL detected (no node-id), but no API token is available.\n' +
          'Provide --figma-token <token> or set FIGMA_TOKEN to auto-discover component URLs.',
      );
      process.exit(1);
    }

    const filePayload = await fetchFigmaFile({
      fileKey: figmaFileDescriptor.fileKey,
      token: figmaToken,
    });

    // Validate filePayload structure before casting
    if (!isPlainObject(filePayload)) {
      logger.error(
        'Figma API returned an invalid payload structure.\n' +
          'Expected an object with nodes, components, and componentSets properties.',
      );
      process.exit(1);
    }

    const componentMap = buildFigmaComponentMap(
      figmaFileDescriptor,
      isPlainObject(filePayload.nodes) ? (filePayload.nodes as Record<string, unknown>) : {},
      isPlainObject(filePayload.components) ? (filePayload.components as Record<string, unknown>) : {},
      isPlainObject(filePayload.componentSets) ? (filePayload.componentSets as Record<string, unknown>) : {},
    );
    const writtenPath = writeJsonFileAtomic(figmaMapOutPath, componentMap);
    const summary = buildFigmaComponentMapSummary(componentMap);
    const suggestions = renderComponentUrlSuggestions(componentMap, 20);

    console.log(
      'Figma file URL processed in discovery mode.\n' +
        `Component map: ${writtenPath}\n` +
        `Components found: ${summary.stats.component_nodes_total} (${summary.stats.component_sets} sets, ${summary.stats.components} components)\n` +
        `Pages: ${summary.stats.pages}\n` +
        'Next step: pick one component URL and rerun ds:doc-from-figma-url with --component-name.\n' +
        `${suggestions ? `Sample component URLs:\n${suggestions}\n` : ''}`,
    );
    return;
  }

  const agent = parseAgentType(args.agent, '--agent');
  const force = String(args.force || 'false') === 'true';
  const allowDocStatusChange =
    String(args['allow-doc-status-change'] || 'false') === 'true';
  const rawComponentName = args['component-name'] || '';
  const normalized = normalizeComponentName(rawComponentName);
  const componentName = normalized.displayName;
  const componentSlug = normalized.fileSlug;
  const outputPath = args.output
    ? path.resolve(args.output)
    : componentSlug
      ? path.resolve(path.join(componentDocsDir, `${componentSlug}.md`))
      : '';
  const outputSlug = componentSlug || path.basename(outputPath, path.extname(outputPath));
  const captureProof = parseBooleanOption(
    args['capture-proof'],
    '--capture-proof',
    true,
  );
  const captureProofStrict = parseBooleanOption(
    args['capture-proof-strict'],
    '--capture-proof-strict',
    false,
  );
  const captureProofVariants = parseBooleanOption(
    args['capture-proof-variants'],
    '--capture-proof-variants',
    true,
  );
  const captureProofVariantLimit = parsePositiveNumber(
    args['capture-proof-variant-limit'],
    '--capture-proof-variant-limit',
    6,
  );

  if (!outputPath) {
    logger.error(
      'Missing deterministic output path.\n' +
        'Provide --output <path>, or pass --component-name so the script can derive docs/components/<snake_case>.md.',
    );
    process.exit(1);
  }

  if (allowDocStatusChange && !force) {
    logger.error(
      'doc_status override requires explicit force.\n' +
        'Use `--allow-doc-status-change true --force true` only for exceptional cases.',
    );
    process.exit(1);
  }

  const specComponentsDir = path.join(docsRootDir, '_spec', 'components');
  const overviewPath = path.join(componentDocsDir, 'overview.md');
  const registryIndexPath = path.join(
    docsRootDir,
    '_generated',
    'component-registry.json',
  );
  const tokenUsageIndexPath = path.join(
    docsRootDir,
    '_generated',
    'token-usage-index.json',
  );
  const tokenRegistryPath = path.join(
    docsRootDir,
    '_generated',
    'token-registry.json',
  );
  const tokenUsageScriptPath = path.join(
    PROJECT_ROOT,
    'tooling',
    'scripts',
    'ds-token-usage-index.mjs',
  );
  const captureVisualProofScriptPath = path.join(
    PROJECT_ROOT,
    'tooling',
    'scripts',
    'ds-capture-visual-proof.mjs',
  );
  const visualProofDir = path.join(docsRootDir, '_generated', 'visual-proofs');
  const visualProofImageDir = path.join(visualProofDir, 'images');
  const visualProofPath = path.join(visualProofDir, `${outputSlug}.json`);
  const visualProofImagePath = path.join(visualProofImageDir, `${outputSlug}.png`);
  const scopeSnapshot = captureScopedWriteSnapshot({
    directories: [componentDocsDir, specComponentsDir],
    files: [registryIndexPath, tokenUsageIndexPath],
    extensions: ['.md', '.yml', '.json'],
  });
  const allowedWritePaths = [
    outputPath,
    overviewPath,
    registryIndexPath,
    tokenUsageIndexPath,
    figmaMapOutPath,
    visualProofPath,
    visualProofImagePath,
  ];

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const skeletonPath = writeComponentDocSkeleton({
    componentName: componentName || 'Component',
    outputPath,
  });
  tempArtifacts.track(skeletonPath);
  const styleReferencePath = resolveStyleReferencePath({
    componentDocsDir,
    outputPath,
  });

  const prompt = buildAgentPrompt({
    context: [
      'Generate one component documentation markdown from Figma.',
      componentName ? `Expected component name: ${componentName}` : '',
    ],
    sources: [
      `Figma URL: ${figmaUrl}`,
      styleReferencePath
        ? `Existing docs style reference: ${styleReferencePath}`
        : '',
      `Canonical markdown skeleton (fill-only): ${skeletonPath}`,
      `Golden markdown example for tone/detail: ${GOLDEN_COMPONENT_DOC_SAMPLE_PATH}`,
      `Output path (required): ${outputPath}`,
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
  const outputSnapshot = captureFileSnapshot(outputPath);
  const previousFrontmatter = outputSnapshot.exists
    ? parseMarkdownFrontmatter(outputSnapshot.content).frontmatter
    : {};

  try {
    runAgentPrompt({
      prompt,
      agent,
      label: `doc-from-figma-url-${componentNameToSnakeCase(componentName || 'component')}`,
    });
    if (!fs.existsSync(outputPath)) {
      throw new Error(
        `Agent did not produce markdown output at the required path: ${outputPath}`,
      );
    }
    normalizeAgentOutputFile(outputPath);
    formatMarkdownTarget(outputPath);

    const generatedMarkdown = fs.readFileSync(outputPath, 'utf8');
    const { frontmatter: generatedFrontmatter } =
      parseMarkdownFrontmatter(generatedMarkdown);
    if (outputSnapshot.exists) {
      assertDocStatusStable({
        beforeFrontmatter: previousFrontmatter,
        afterFrontmatter: generatedFrontmatter,
        allowDocStatusChange,
        label: `${outputPath} frontmatter`,
      });
      assertEvidenceGatedScalarChanges({
        before: previousFrontmatter,
        after: generatedFrontmatter,
        allowedKnownToKnownPrefixes: FRONTMATTER_EVIDENCE_PREFIXES,
        label: `${outputPath} frontmatter`,
      });
    }
    const outputContract = validateAgentOutputContract({
      markdown: generatedMarkdown,
      expectedComponentName: componentName || undefined,
    });
    if (!outputContract.ok) {
      const reportPath = writeAgentOutputErrorReport({
        componentSlug:
          componentSlug || path.basename(outputPath, path.extname(outputPath)),
        scriptName: 'ds-doc-from-figma-url',
        markdownPath: outputPath,
        errors: outputContract.errors,
        rawOutput: generatedMarkdown,
      });
      throw new Error(
        'Generated markdown failed output contract.\n' +
          `Report: ${reportPath}\n` +
          `${JSON.stringify({ file: outputPath, errors: outputContract.errors }, null, 2)}`,
      );
    }

    const drift = updateAgentDriftBaseline({
      markdownPath: outputPath,
      componentSlug:
        componentSlug || path.basename(outputPath, path.extname(outputPath)),
      scriptName: 'ds-doc-from-figma-url',
    });
    if (drift.driftDetected) {
      logger.warn(
        'Output contract drift detected.\n' +
          `Baseline: ${drift.baselinePath}\n` +
          `Previous hash: ${drift.previousHash}\n` +
          `Current hash: ${drift.hash}`,
      );
    }

    if (captureProof) {
      const nodeId = String(figmaUrlParsed.nodeId || '').trim();
      if (!nodeId) {
        const message =
          'Visual proof capture skipped: no node-id was resolved from the Figma URL.';
        if (captureProofStrict) {
          throw new Error(message);
        }
        logger.warn(message);
      } else {
        try {
          runOrThrow(process.execPath, [
            captureVisualProofScriptPath,
            '--markdown',
            outputPath,
            '--spec-file',
            path.join(specComponentsDir, `${outputSlug}.yml`),
            '--component-set-id',
            nodeId,
            '--proof-dir',
            visualProofDir,
            '--proof-image-dir',
            visualProofImageDir,
            '--format',
            'png',
            '--agent',
            agent,
            '--include-variants',
            captureProofVariants ? 'true' : 'false',
            '--variant-limit',
            String(Math.floor(captureProofVariantLimit)),
            ...(figmaUrl ? ['--url', figmaUrl] : []),
            ...(figmaToken ? ['--figma-token', figmaToken] : []),
          ]);
        } catch (error) {
          const message = `Automatic visual proof capture failed: ${
            error instanceof Error ? error.message : String(error)
          }`;
          if (captureProofStrict) {
            throw new Error(message);
          }
          logger.warn(message);
        }
      }
    }

    syncDocumentationIndices({
      docsDir: componentDocsDir,
      overviewPath,
      specsDir: specComponentsDir,
      proofsDir: visualProofDir,
      renderDir: path.join(docsRootDir, '_generated', 'figma_doc_models'),
      registryPath: registryIndexPath,
    });
    runOrThrow(process.execPath, [
      tokenUsageScriptPath,
      '--registry',
      tokenRegistryPath,
      '--spec-root',
      specComponentsDir,
      '--out',
      tokenUsageIndexPath,
    ]);
    assertScopedWritePolicy({
      snapshot: scopeSnapshot,
      allowedPaths: allowedWritePaths,
      label: 'ds-doc-from-figma-url',
    });
  } catch (error) {
    restoreFileSnapshot(outputPath, outputSnapshot);
    let scopeMessage = '';
    try {
      assertScopedWritePolicy({
        snapshot: scopeSnapshot,
        allowedPaths: allowedWritePaths,
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
