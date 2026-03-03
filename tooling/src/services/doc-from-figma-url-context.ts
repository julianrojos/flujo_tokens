/**
 * Doc from Figma URL Context
 *
 * Resolves and validates doc generation context from CLI arguments.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PROJECT_ROOT } from '../utils/system-context.js';
import { normalizeComponentName } from '../utils/component-name.js';
import { resolveStyleReferencePath } from '../../scripts/lib/style-reference.mjs';
import { writeComponentDocSkeleton } from '../utils/doc-templates.js';
import { captureScopedWriteSnapshot } from '../services/scoped-write-guard.js';
import { TempArtifactManager } from '../services/temp-artifacts.js';
import type { ParsedFigmaFileUrl } from './figma-component-map.js';
import { parseFigmaUrl } from '../utils/figma-url-parser.js';
import {
  parseBooleanOption,
  parsePositiveNumber,
  parseAgentType,
} from '../utils/parse-options.js';

/**
 * Resolved doc generation context.
 */
export interface DocGenerationContext {
  // Paths
  docsRootDir: string;
  componentDocsDir: string;
  outputPath: string;
  outputSlug: string;
  specComponentsDir: string;
  overviewPath: string;
  registryIndexPath: string;
  tokenUsageIndexPath: string;
  tokenRegistryPath: string;
  tokenUsageScriptPath: string;
  captureVisualProofScriptPath: string;
  visualProofDir: string;
  visualProofImageDir: string;
  visualProofPath: string;
  visualProofImagePath: string;
  skeletonPath: string;
  styleReferencePath: string;

  // Args
  figmaUrl: string;
  figmaFileDescriptor: ParsedFigmaFileUrl;
  figmaToken: string;
  figmaMapOutPath: string;
  componentNodeId: string;
  agent: 'codex' | 'claude' | 'gemini' | 'auto';
  componentName: string;
  componentSlug: string;
  force: boolean;
  allowDocStatusChange: boolean;
  captureProof: boolean;
  captureProofStrict: boolean;
  captureProofVariants: boolean;
  captureProofVariantLimit: number;

  // Snapshots
  scopeSnapshot: ReturnType<typeof captureScopedWriteSnapshot>;
  allowedWritePaths: string[];
}

/**
 * Resolve and validate doc generation context.
 *
 * Validates output path, allowDocStatusChange + force constraints.
 * Throws Error instead of calling process.exit() for testability.
 */
export function resolveDocContext(
  args: {
    'component-name'?: string;
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
  },
  figmaFileDescriptor: ParsedFigmaFileUrl,
  figmaUrl: string,
  figmaToken: string,
  figmaMapOutPath: string,
  docsRootDir: string,
  componentDocsDir: string,
  tempArtifacts: TempArtifactManager,
): DocGenerationContext {
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
  const figmaUrlParsed = parseFigmaUrl(figmaUrl);
  const componentNodeId = figmaUrlParsed.nodeId || '';

  if (!outputPath) {
    throw new Error(
      'Missing deterministic output path.\n' +
      'Provide --output <path>, or pass --component-name so the script can derive docs/components/<snake_case>.md.',
    );
  }

  if (allowDocStatusChange && !force) {
    throw new Error(
      'doc_status override requires explicit force.\n' +
      'Use `--allow-doc-status-change true --force true` only for exceptional cases.',
    );
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

  return {
    // Paths
    docsRootDir,
    componentDocsDir,
    outputPath,
    outputSlug,
    specComponentsDir,
    overviewPath,
    registryIndexPath,
    tokenUsageIndexPath,
    tokenRegistryPath,
    tokenUsageScriptPath,
    captureVisualProofScriptPath,
    visualProofDir,
    visualProofImageDir,
    visualProofPath,
    visualProofImagePath,
    skeletonPath,
    styleReferencePath,

    // Args
    figmaUrl,
    figmaFileDescriptor,
    figmaToken,
    figmaMapOutPath,
    componentNodeId,
    agent,
    componentName,
    componentSlug,
    force,
    allowDocStatusChange,
    captureProof,
    captureProofStrict,
    captureProofVariants,
    captureProofVariantLimit,

    // Snapshots
    scopeSnapshot,
    allowedWritePaths,
  };
}
