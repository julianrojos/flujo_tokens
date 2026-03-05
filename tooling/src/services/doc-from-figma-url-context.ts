/**
 * Doc from Figma URL Context
 *
 * Resolves and validates doc generation context from CLI arguments.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PROJECT_ROOT } from '../utils/system-context.js';
import { normalizeComponentName } from '../utils/component-name.js';
import { writeComponentDocSkeleton } from '../utils/doc-templates.js';
import { captureScopedWriteSnapshot } from '../services/scoped-write-guard.js';
import { TempArtifactManager } from '../services/temp-artifacts.js';
import type { ParsedFigmaFileUrl } from './figma-component-map.js';
import { parseFigmaUrl } from '../utils/figma-url-parser.js';
import { logger } from '../utils/logger.js';
import {
  parseBooleanOption,
  parsePositiveNumber,
  parseAgentType,
} from '../utils/parse-options.js';

type ResolveStyleReferencePathFn = (opts: {
  componentDocsDir: string;
  outputPath: string;
}) => string;

type StyleReferenceStatus = 'missing' | 'error' | 'ok';

interface StyleReferenceModule {
  resolveStyleReferencePath?: ResolveStyleReferencePathFn;
}

interface StyleReferenceResolution {
  status: StyleReferenceStatus;
  resolver: ResolveStyleReferencePathFn | null;
  reason?: string;
}

interface ResolveDocContextDeps {
  importStyleReferenceModule?: () => Promise<StyleReferenceModule>;
  warn?: (message: string) => void;
  ci?: string | undefined;
}

const importStyleReferenceModuleDefault = async (): Promise<StyleReferenceModule> =>
  // @ts-ignore - .mjs module resolution issue (declaration exists at ../../scripts/lib/style-reference.d.ts)
  import('../../scripts/lib/style-reference.mjs') as Promise<StyleReferenceModule>;

let styleReferenceResolutionCache: StyleReferenceResolution | null = null;

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function resolveStyleReferenceLoader(
  importStyleReferenceModule: (() => Promise<StyleReferenceModule>) | undefined,
): Promise<StyleReferenceResolution> {
  const shouldUseCache = !importStyleReferenceModule;
  if (shouldUseCache && styleReferenceResolutionCache) {
    return styleReferenceResolutionCache;
  }

  let resolved: StyleReferenceResolution;
  const importer = importStyleReferenceModule ?? importStyleReferenceModuleDefault;
  try {
    const mod = await importer();
    if (typeof mod.resolveStyleReferencePath !== 'function') {
      resolved = {
        status: 'missing',
        resolver: null,
        reason: 'Module export `resolveStyleReferencePath` is not available.',
      };
    } else {
      resolved = {
        status: 'ok',
        resolver: mod.resolveStyleReferencePath,
      };
    }
  } catch (error) {
    resolved = {
      status: 'error',
      resolver: null,
      reason: summarizeError(error),
    };
  }

  if (shouldUseCache) {
    styleReferenceResolutionCache = resolved;
  }
  return resolved;
}

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
  styleReferenceStatus: StyleReferenceStatus;

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
export async function resolveDocContext(
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
    'strict-style-reference'?: string;
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
  deps: ResolveDocContextDeps = {},
): Promise<DocGenerationContext> {
  const {
    importStyleReferenceModule,
    warn = logger.warn,
    ci = process.env.CI,
  } = deps;

  const agent = parseAgentType(args.agent, '--agent');
  const force = String(args.force || 'false') === 'true';
  const allowDocStatusChange =
    String(args['allow-doc-status-change'] || 'false') === 'true';
  
  // CI detection: accept common truthy values (true, 1, yes, on)
  const ciValue = String(ci || '').trim().toLowerCase();
  const isCI = ciValue === 'true' || ciValue === '1' || ciValue === 'yes' || ciValue === 'on';
  
  const strictStyleReference = parseBooleanOption(
    args['strict-style-reference'],
    '--strict-style-reference',
    isCI,
  );
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
  const styleReferenceLoad = await resolveStyleReferenceLoader(importStyleReferenceModule);
  let styleReferenceStatus: StyleReferenceStatus = styleReferenceLoad.status;
  let styleReferenceReason = styleReferenceLoad.reason || '';
  let styleReferencePath = '';

  if (styleReferenceLoad.resolver) {
    try {
      const resolvedPath = String(
        styleReferenceLoad.resolver({ componentDocsDir, outputPath }) || '',
      ).trim();
      if (resolvedPath) {
        styleReferencePath = resolvedPath;
        styleReferenceStatus = 'ok';
      } else {
        styleReferenceStatus = 'missing';
        styleReferenceReason =
          styleReferenceReason ||
          'resolveStyleReferencePath returned an empty path.';
      }
    } catch (error) {
      styleReferenceStatus = 'error';
      styleReferenceReason = summarizeError(error);
    }
  }

  if (styleReferenceStatus !== 'ok') {
    warn(
      `[ds:doc-from-figma-url] Style reference unavailable (${styleReferenceStatus}). ` +
      `Continuing without style reference. ${styleReferenceReason ? `Reason: ${styleReferenceReason}` : ''}`.trim(),
    );
    if (strictStyleReference) {
      throw new Error(
        `Style reference resolution failed in strict mode (${styleReferenceStatus}). ` +
        `${styleReferenceReason ? `Reason: ${styleReferenceReason}. ` : ''}` +
        'Set --strict-style-reference false (or CI=false) to continue without style reference.',
      );
    }
  }

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
    styleReferenceStatus,

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

/**
 * Clear the style reference resolution cache.
 * Exported for test teardown to prevent cache contamination between tests.
 */
export function clearStyleReferenceCache(): void {
  styleReferenceResolutionCache = null;
}
