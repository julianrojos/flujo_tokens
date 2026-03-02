/**
 * Active Markdown to Figma Preparation
 *
 * Handles all preparation before pipeline execution.
 * Extracts spec resolution, traceability validation, staleness checks, and CLI args resolution.
 *
 * This module is responsible for:
 * - Resolving all input paths from CLI args
 * - Parsing and validating spec YAML
 * - Validating Figma node IDs and traceability
 * - Running spec and markdown validation
 * - Checking markdown staleness
 * - Resolving configuration flags (force, offsetX, generatedDir, etc.)
 *
 * NOT responsible for:
 * - Building phases or execution objects
 * - Running any part of the pipeline
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { normalizeNodeId, isValidNodeId } from '../utils/figma-node-id.js';
import { isTbdMarker } from '../utils/tbd.js';
import { logger } from '../utils/logger.js';
import {
  validateSpecPreflight,
  ensureValidationResults,
} from './spec-validation-phase.js';
import { detectMarkdownStaleness } from './markdown-staleness.js';
import {
  normalizeComponentName,
  componentNameToSnakeCase,
} from '../utils/component-name.js';
import type { SystemContext } from '../utils/system-context.js';

/**
 * Arguments for preparation.
 */
export interface ActiveMdToFigmaPreparationArgs {
  markdown?: string;
  'component-name'?: string;
  'spec-file'?: string;
  'skip-validation'?: string;
  force?: string;
  'sync-state'?: string;
  'token-registry'?: string;
  'capture-proof-strict'?: string;
  'component-set-id'?: string;
  theme?: string;
  'generated-dir'?: string;
  'offset-x'?: string;
  url?: string;
  agent?: string;
  system?: string;
}

/**
 * Result of preparation.
 * Contains all resolved values needed for runtime context.
 */
export interface ActiveMdToFigmaPreparationResult {
  // Paths
  markdownPath: string;
  specPath: string;
  tokenRegistryPath: string;
  syncStatePath?: string;
  generatedDir: string;

  // Component identity
  fileBase: string;
  componentName: string;
  componentSlug: string;

  // Figma context
  resolvedComponentSetId: string;
  specStatus: string;

  // Configuration
  force: boolean;
  skipValidation: boolean;
  captureProofStrict: boolean;
  offsetX: number;
  figmaUrl?: string;
  agent: 'codex' | 'claude' | 'gemini' | 'auto';

  // System context
  ctx: SystemContext;
}

/**
 * Execute preparation (resolution + validation).
 *
 * This function handles:
 * - Active markdown path resolution
 * - Spec file resolution and parsing
 * - Component name normalization
 * - Figma node ID validation and traceability
 * - Spec and markdown validation
 * - Markdown staleness detection
 * - CLI args resolution (offsetX, generatedDir, url, agent, etc.)
 *
 * @param args - Command line arguments
 * @returns Preparation result with all resolved values
 * @throws {Error} If preparation validation fails (process exits)
 */
export function executeActiveMdToFigmaPreparation(
  args: ActiveMdToFigmaPreparationArgs,
): ActiveMdToFigmaPreparationResult {
  // Resolve active markdown path
  const activeMarkdown =
    args.markdown ||
    process.env.ANTIGRAVITY_ACTIVE_FILE ||
    process.env.ACTIVE_FILE ||
    process.env.AG_ACTIVE_FILE;

  if (!activeMarkdown) {
    logger.error(
      'Missing active markdown path.\nUse --markdown <path> (and optionally --agent codex|claude|gemini) or export ANTIGRAVITY_ACTIVE_FILE.',
    );
    process.exit(1);
  }

  const markdownPath = path.resolve(activeMarkdown);
  if (!fs.existsSync(markdownPath)) {
    logger.error(`Markdown file not found: ${markdownPath}`);
    process.exit(1);
  }

  // Resolve system context
  const ctx = resolveSystemContextSafe({ system: args.system });

  // Resolve component identity
  const fileBase = path.basename(markdownPath, path.extname(markdownPath));
  const normalizedName = normalizeComponentName(
    args['component-name'] || fileBase,
  );
  const componentName = normalizedName.displayName || 'Component';
  const componentSlug =
    normalizedName.fileSlug || componentNameToSnakeCase(fileBase);

  // Resolve spec path
  const specPath = path.resolve(
    args['spec-file'] ||
    path.join(ctx.paths.specs, `${componentSlug}.yml`),
  );

  if (!fs.existsSync(specPath)) {
    logger.error(
      'Missing required spec file.\n' +
      `Spec: ${specPath}\n` +
      `Run: npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}"`,
    );
    process.exit(1);
  }

  // Parse configuration flags
  const skipValidation = String(args['skip-validation'] || 'false') === 'true';
  const force = String(args.force || 'false') === 'true';
  const syncStatePath = args['sync-state'] || undefined;
  const tokenRegistryPath =
    args['token-registry'] || ctx.paths.tokenRegistry;
  const captureProofStrict = String(args['capture-proof-strict'] || 'false') === 'true';
  const offsetX = Number(args['offset-x'] || '200');
  const generatedDir = args['generated-dir'] || path.join(ctx.paths.generated, 'figma_doc_models');
  const figmaUrl = args.url;
  const agent = (args.agent || 'auto') as 'codex' | 'claude' | 'gemini' | 'auto';

  // Parse spec and resolve Figma node ID
  const { specStatus, specNodeId } = parseSpecAndResolveNodeId(specPath);

  // Resolve CLI node ID and validate traceability
  const resolvedComponentSetId = resolveComponentSetId(
    args,
    specNodeId,
    specStatus,
    force,
  );

  // Validate spec and markdown pre-flight
  validateSpecAndMarkdown(specPath, tokenRegistryPath, markdownPath, skipValidation, force);

  // Check markdown staleness
  checkMarkdownStaleness(specPath, markdownPath, syncStatePath, force);

  return {
    markdownPath,
    specPath,
    tokenRegistryPath,
    syncStatePath,
    generatedDir,
    fileBase,
    componentName,
    componentSlug,
    resolvedComponentSetId,
    specStatus,
    force,
    skipValidation,
    captureProofStrict,
    offsetX,
    figmaUrl,
    agent,
    ctx,
  };
}

/**
 * Parse spec YAML and resolve node ID.
 */
function parseSpecAndResolveNodeId(specPath: string): { specStatus: string; specNodeId: string } {
  let specStatus = 'draft';
  let specNodeId = '';

  try {
    const specParsed = parseYamlDocument(
      fs.readFileSync(specPath, 'utf8'),
      `spec YAML (${path.basename(specPath)})`,
    ) as Record<string, unknown>;
    specStatus = String(specParsed.status || 'draft')
      .trim()
      .toLowerCase();
    const specFigma =
      specParsed && typeof specParsed.figma === 'object'
        ? (specParsed.figma as Record<string, unknown>)
        : {};
    const specNodeIdRaw = String(specFigma?.component_set_node_id || '').trim();
    if (specNodeIdRaw && !isTbdMarker(specNodeIdRaw)) {
      const normalizedSpecNodeId = normalizeNodeId(specNodeIdRaw);
      if (!isValidNodeId(normalizedSpecNodeId)) {
        if (specStatus === 'ready') {
          logger.error(
            'Invalid figma.component_set_node_id in ready spec.\n' +
            `Spec: ${specPath}\n` +
            'Expected format: 123:456',
          );
          process.exit(1);
        }
        logger.warn(
          `Warning: ignoring invalid figma.component_set_node_id in spec (${specNodeIdRaw}).`,
        );
      } else {
        specNodeId = normalizedSpecNodeId;
      }
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  return { specStatus, specNodeId };
}

/**
 * Resolve component set ID from CLI and spec.
 */
function resolveComponentSetId(
  args: ActiveMdToFigmaPreflightArgs,
  specNodeId: string,
  specStatus: string,
  force: boolean,
): string {
  const cliNodeIdRaw = String(args['component-set-id'] || '').trim();
  const cliNodeId = cliNodeIdRaw ? normalizeNodeId(cliNodeIdRaw) : '';

  if (cliNodeId && !isValidNodeId(cliNodeId)) {
    logger.error(
      'Invalid --component-set-id format.\n' +
      `Provided: ${cliNodeIdRaw}\n` +
      'Expected format: 123:456',
    );
    process.exit(1);
  }

  if (cliNodeId && specNodeId && cliNodeId !== specNodeId && !force) {
    logger.error(
      'Traceability mismatch between CLI and spec.\n' +
      `CLI --component-set-id: ${cliNodeId}\n` +
      `Spec figma.component_set_node_id: ${specNodeId}\n` +
      'Use --force true only if you intentionally want to override the spec.',
    );
    process.exit(1);
  }

  const resolvedComponentSetId = cliNodeId || specNodeId || '';

  if (!resolvedComponentSetId) {
    if (specStatus === 'ready') {
      logger.error(
        'Missing figma.component_set_node_id for ready spec.\n' +
        `Spec: ${specPath}\n` +
        'Add figma.component_set_node_id to the spec to keep Figma placement deterministic.',
      );
      process.exit(1);
    }
    logger.warn(
      'Warning: component_set_node_id not available. Falling back to name-based lookup (non-deterministic).',
    );
  }

  return resolvedComponentSetId;
}

/**
 * Validate spec and markdown pre-flight.
 */
function validateSpecAndMarkdown(
  specPath: string,
  tokenRegistryPath: string,
  markdownPath: string,
  skipValidation: boolean,
  force: boolean,
): void {
  try {
    const validationResult = validateSpecPreflight({
      specPath,
      tokenRegistryPath,
      markdownPath,
      skipValidation,
      force,
    });
    ensureValidationResults(validationResult, specPath);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Check markdown staleness.
 */
function checkMarkdownStaleness(
  specPath: string,
  markdownPath: string,
  syncStatePath: string | undefined,
  force: boolean,
): void {
  if (!force) {
    const staleness = detectMarkdownStaleness({
      specPath,
      markdownPath,
      syncStatePath,
    });
    if (staleness.stale) {
      logger.error(
        'Markdown is stale relative to its source spec. Rendering to Figma was blocked.\n' +
        `Reason: ${staleness.reason}\n` +
        `Spec: ${specPath}\n` +
        `Markdown: ${markdownPath}\n` +
        `Run: npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}"\n` +
        'Use --force true only if you intentionally want to render without regenerating markdown.',
      );
      process.exit(1);
    }
  }
}

// Re-export for runner convenience
export { resolveSystemContextSafe, DEFAULT_THEME_PATH, type SystemContext } from '../utils/system-context.js';
