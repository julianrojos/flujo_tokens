/**
 * Capture Visual Proof Preparation
 *
 * Resolves and validates capture context from CLI arguments.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CaptureVisualProofArgs } from '../types/capture-visual-proof.js';
import { CaptureError } from './capture-visual-proof-error.js';
import {
  loadSpecFigma,
  resolveFigmaFileKey,
} from './capture-visual-proof-figma.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';
import { normalizeComponentName, componentNameToSnakeCase } from '../utils/component-name.js';
import { normalizeNodeId, isValidNodeId } from '../utils/figma-node-id.js';
import {
  parseBooleanOption,
  parsePositiveInteger,
  parseMainCaptureMode,
  normalizeVariantSlug,
} from '../utils/parse-options.js';

/**
 * Resolved capture context.
 */
export interface CaptureVisualProofContext {
  componentSlug: string;
  componentDocsDir: string;
  docsRootDir: string;
  specRoot: string;
  markdownPath: string;
  specPath: string;
  specFigma: Record<string, unknown>;
  proofDir: string;
  proofImageDir: string;
  format: string;
  scale: number;
  figmaUrl: string;
  agent: string;
  mainCaptureMode: 'auto' | 'agent' | 'rest';
  dryRun: boolean;
  skipIndexSync: boolean;
  storeLocalImage: boolean;
  requireLocalImage: boolean;
  downloadTimeoutMs: number;
  includeVariants: boolean;
  variantLimit: number;
  figmaToken: string;
  figmaFileKey: string;
  nodeId: string;
}

/**
 * Resolve node ID from CLI arg or spec.
 */
function resolveNodeId({
  cliNodeIdRaw,
  specPath,
  specFigma,
}: {
  cliNodeIdRaw: string;
  specPath: string;
  specFigma: Record<string, unknown>;
}): string {
  const cliNodeId = normalizeNodeId(String(cliNodeIdRaw || '').trim());
  if (cliNodeId) {
    if (!isValidNodeId(cliNodeId)) {
      throw new CaptureError(
        `Invalid --component-set-id format: ${cliNodeIdRaw}. Expected 123:456.`,
        'INVALID_NODE_ID_FORMAT',
      );
    }
    return cliNodeId;
  }

  if (!fs.existsSync(specPath)) {
    throw new CaptureError(
      `Missing spec file and no --component-set-id provided: ${specPath}`,
      'SPEC_FILE_NOT_FOUND',
    );
  }

  const figma = specFigma && typeof specFigma === 'object' ? specFigma : {};
  const nodeId = normalizeNodeId(String((figma as Record<string, string>).component_set_node_id || '').trim());
  if (!nodeId || !isValidNodeId(nodeId)) {
    throw new CaptureError(
      'Unable to resolve a valid figma.component_set_node_id from spec. ' +
      'Provide --component-set-id explicitly or update the spec.',
      'NODE_ID_NOT_FOUND_IN_SPEC',
    );
  }
  return nodeId;
}

/**
 * Prepare capture context from CLI arguments.
 */
export function prepareCaptureContext(args: CaptureVisualProofArgs): CaptureVisualProofContext {
  const componentInput = String(args['component-name'] || '').trim();
  const normalizedComponent = normalizeComponentName(componentInput);
  const explicitMarkdownPath = String(args.markdown || '').trim();
  const slugFromMarkdown = explicitMarkdownPath
    ? path.basename(explicitMarkdownPath, path.extname(explicitMarkdownPath))
    : '';
  const componentSlug =
    normalizedComponent.fileSlug ||
    componentNameToSnakeCase(componentInput) ||
    slugFromMarkdown;

  if (!componentSlug && !explicitMarkdownPath) {
    throw new CaptureError(
      'Missing --component-name or --markdown. One of them is required.',
      'MISSING_COMPONENT_INPUT',
    );
  }

  const ctx = resolveSystemContextSafe({ system: args.system });

  const docsRootInput = path.resolve(args['docs-root'] || ctx.paths.docs);
  const componentDocsDir =
    path.basename(docsRootInput) === 'components'
      ? docsRootInput
      : path.join(docsRootInput, 'components');
  const docsRootDir =
    path.basename(docsRootInput) === 'components'
      ? path.dirname(docsRootInput)
      : docsRootInput;
  const specRoot = path.resolve(
    args['spec-root'] || ctx.paths.specs,
  );
  const markdownPath = path.resolve(
    explicitMarkdownPath || path.join(componentDocsDir, `${componentSlug}.md`),
  );
  const specPath = path.resolve(
    args['spec-file'] || path.join(specRoot, `${componentSlug}.yml`),
  );
  const specFigma = loadSpecFigma(specPath, parseYamlDocument);
  const proofDir = path.resolve(
    args['proof-dir'] || path.join(ctx.paths.generated, 'visual-proofs'),
  );
  const proofImageDir = path.resolve(
    args['proof-image-dir'] ||
    path.join(ctx.paths.generated, 'visual-proofs', 'images'),
  );
  const format = String(args.format || 'png').trim().toLowerCase();
  const scale = Number(args.scale || 2);
  const figmaUrl = String(args.url || '').trim();
  const agent = String(args.agent || process.env.DS_AGENT || 'auto');
  const mainCaptureMode = parseMainCaptureMode(String(args['main-capture-mode'] || 'auto'));
  const dryRun = parseBooleanOption(args['dry-run'], '--dry-run', false);
  const skipIndexSync = parseBooleanOption(
    args['skip-index-sync'],
    '--skip-index-sync',
    false,
  );
  const storeLocalImage = parseBooleanOption(
    args['store-local-image'],
    '--store-local-image',
    true,
  );
  const requireLocalImage = parseBooleanOption(
    args['require-local-image'],
    '--require-local-image',
    true,
  );
  const downloadTimeoutMs = parsePositiveInteger(
    args['download-timeout-ms'],
    '--download-timeout-ms',
    30000,
  );
  const includeVariants = parseBooleanOption(
    args['include-variants'],
    '--include-variants',
    true,
  );
  const variantLimit = parsePositiveInteger(
    args['variant-limit'],
    '--variant-limit',
    6,
  );
  const figmaToken = String(args['figma-token'] || process.env.FIGMA_TOKEN || '').trim();
  const figmaFileKey = resolveFigmaFileKey({
    figmaUrl,
    specFigma,
  });

  if (!fs.existsSync(markdownPath)) {
    throw new CaptureError(`Markdown file not found: ${markdownPath}`, 'MARKDOWN_NOT_FOUND');
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new CaptureError(`Invalid --scale value: ${args.scale}`, 'INVALID_SCALE');
  }

  const nodeId = resolveNodeId({
    cliNodeIdRaw: String(args['component-set-id'] || ''),
    specPath,
    specFigma,
  });

  return {
    componentSlug,
    componentDocsDir,
    docsRootDir,
    specRoot,
    markdownPath,
    specPath,
    specFigma,
    proofDir,
    proofImageDir,
    format,
    scale,
    figmaUrl,
    agent,
    mainCaptureMode,
    dryRun,
    skipIndexSync,
    storeLocalImage,
    requireLocalImage,
    downloadTimeoutMs,
    includeVariants,
    variantLimit,
    figmaToken,
    figmaFileKey,
    nodeId,
  };
}
