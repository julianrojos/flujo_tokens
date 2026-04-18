/**
 * Capture Visual Proof Preparation
 *
 * Resolves and validates capture context from CLI arguments.
 */

import * as path from 'node:path';

import type { CaptureVisualProofArgs } from '../types/capture-visual-proof.js';
import { CaptureError } from './capture-visual-proof-error.js';
import { resolveFigmaFileKey } from './capture-visual-proof-figma.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';
import { normalizeComponentName, componentNameToSnakeCase } from '../utils/component-name.js';
import { normalizeNodeId, isValidNodeId } from '../utils/figma-node-id.js';
import {
  parseBooleanOption,
  parsePositiveInteger,
  parseMainCaptureMode,
} from '../utils/parse-options.js';

/**
 * Resolved capture context.
 */
export interface CaptureVisualProofContext {
  systemId: string;
  componentSlug: string;
  docsRootDir: string;
  proofDir: string;
  proofImageDir: string;
  format: string;
  scale: number;
  figmaUrl: string;
  agent: string;
  mainCaptureMode: 'auto' | 'agent' | 'rest';
  dryRun: boolean;
  skipDbPersistence: boolean;
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
}: {
  cliNodeIdRaw: string;
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

  throw new CaptureError(
    'Missing --component-set-id. Provide a valid component set node id explicitly.',
    'NODE_ID_REQUIRED',
  );
}

/**
 * Prepare capture context from CLI arguments.
 */
export function prepareCaptureContext(args: CaptureVisualProofArgs): CaptureVisualProofContext {
  const componentInput = String(args['component-name'] || '').trim();
  const normalizedComponent = normalizeComponentName(componentInput);
  const componentSlug =
    normalizedComponent.fileSlug ||
    componentNameToSnakeCase(componentInput);

  if (!componentSlug) {
    throw new CaptureError(
      'Missing --component-name. One of them is required.',
      'MISSING_COMPONENT_INPUT',
    );
  }

  const ctx = resolveSystemContextSafe({ system: args.system });

  const docsRootInput = path.resolve(args['docs-root'] || ctx.paths.docs);
  const docsRootDir =
    path.basename(docsRootInput) === 'components'
      ? path.dirname(docsRootInput)
      : docsRootInput;
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
  const skipDbPersistence = parseBooleanOption(
    args['skip-db-persistence'],
    '--skip-db-persistence',
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
  const figmaFileKey = resolveFigmaFileKey({ figmaUrl, specFigma: {} });

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new CaptureError(`Invalid --scale value: ${args.scale}`, 'INVALID_SCALE');
  }

  const nodeId = resolveNodeId({
    cliNodeIdRaw: String(args['component-set-id'] || ''),
  });

  return {
    systemId: ctx.id,
    componentSlug,
    docsRootDir,
    proofDir,
    proofImageDir,
    format,
    scale,
    figmaUrl,
    agent,
    mainCaptureMode,
    dryRun,
    skipDbPersistence,
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
