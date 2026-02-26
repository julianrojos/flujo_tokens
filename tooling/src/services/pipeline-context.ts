/**
 * Pipeline Context Service
 *
 * Handles creation of the unified pipeline context, including identity,
 * flags, and path resolution.
 */

import * as path from 'node:path';
import { resolveSystemContextSafe } from '../utils/system-context.js';
import { parseBooleanOption, parsePositiveNumber } from './capture-options.js';
import type {
  PipelineContext,
  PipelineIdentity,
  PipelineFlags,
  PipelinePaths,
} from '../types/pipeline.js';

/**
 * Parses the pipeline identity from arguments.
 */
export function parsePipelineIdentity(args: Record<string, unknown>): PipelineIdentity {
  return {
    repoRoot: process.cwd(),
    figmaUrl: String(args.url || '').trim(),
    figmaToken: String(args['figma-token'] || process.env.FIGMA_TOKEN || '').trim(),
  };
}

/**
 * Parses pipeline flags and options.
 */
export function parsePipelineOptions(args: Record<string, unknown>): PipelineFlags {
  const rawSlug = String(args['component-slug'] || '').trim().toLowerCase();
  const componentSlugOverride = rawSlug.replace(/[\\/]/g, '-').replace(/\.\./g, '');

  return {
    componentSlugOverride,
    componentKind: args['component-kind'] as string | undefined,
    includeVariants: parseBooleanOption(
      args['include-variants'] as string | undefined,
      '--include-variants',
      true,
    ),
    requireExistingDoc: parseBooleanOption(
      args['require-existing-doc'] as string | undefined,
      '--require-existing-doc',
      true,
    ),
    continueOnError: parseBooleanOption(
      args['continue-on-error'] as string | undefined,
      '--continue-on-error',
      true,
    ),
    refreshIndices: parseBooleanOption(
      args['refresh-indices'] as string | undefined,
      '--refresh-indices',
      true,
    ),
    dryRun: parseBooleanOption(args['dry-run'] as string | undefined, '--dry-run', false),
    injectDocSpecs: parseBooleanOption(
      args['inject-doc-specs'] as string | undefined,
      '--inject-doc-specs',
      false,
    ),
    includeSpecExhibits: parseBooleanOption(
      args['include-spec-exhibits'] as string | undefined,
      '--include-spec-exhibits',
      true,
    ),
    variantLimit: Math.floor(
      parsePositiveNumber(args['variant-limit'] as string | undefined, '--variant-limit', 6),
    ),
    scale: parsePositiveNumber(args.scale as string | undefined, '--scale', 2),
    format: String(args.format || 'png').trim().toLowerCase(),
    agent: String(args.agent || 'auto').trim(),
    mainCaptureMode: args['main-capture-mode'] as string | undefined,
    force: String(args.force || 'false') === 'true',
    skipValidation: String(args['skip-validation'] || 'false') === 'true',
    allowNonEvidenceUpdates: String(args['allow-non-evidence-updates'] || 'false') === 'true',
  };
}

/**
 * Resolves all necessary file system paths for the pipeline.
 */
export function resolvePipelinePaths(
  args: Record<string, unknown>,
  systemContext: { paths: { docs?: string; specs?: string; generated?: string; tokenRegistry?: string } },
): PipelinePaths {
  const docsRootOverride = args['docs-root'] ? String(args['docs-root']).trim() : null;
  const docsRootInput = docsRootOverride || systemContext.paths.docs;
  const docsRootResolved = path.resolve(docsRootInput);

  const isComponentsDir = path.basename(docsRootResolved) === 'components';
  const docsRootDir = isComponentsDir ? path.dirname(docsRootResolved) : docsRootResolved;
  const componentDocsDir = isComponentsDir ? docsRootResolved : path.join(docsRootResolved, 'components');

  const proofDir = path.resolve(
    args['proof-dir'] || path.join(systemContext.paths.generated!, 'visual-proofs'),
  );
  const proofImageDir = path.resolve(
    args['proof-image-dir'] || path.join(systemContext.paths.generated!, 'visual-proofs', 'images'),
  );

  const specRoot =
    args['spec-root'] || systemContext.paths.specs || path.join(docsRootDir, '_spec', 'components');
  const resolvedSpecRoot = path.resolve(specRoot);

  return {
    docsRootOverride,
    docsRootDir,
    componentDocsDir,
    proofDir,
    proofImageDir,
    registryIndexPath: path.join(docsRootDir, '_generated', 'component-registry.json'),
    tokenRegistryPath: path.resolve(
      args.registry as string ||
        systemContext.paths.tokenRegistry ||
        path.join(docsRootDir, '_generated', 'token-registry.json'),
    ),
    resolvedSpecRoot,
    templatePath: path.resolve(
      (args.template as string) || path.join(resolvedSpecRoot, '_template.yml'),
    ),
    overviewPath: path.resolve(path.join(docsRootDir, 'overview.md')),
  };
}

/**
 * Creates the full pipeline context.
 */
export function createPipelineContext(args: Record<string, unknown>): PipelineContext {
  const systemContext = resolveSystemContextSafe({ system: args.system as string });

  const identity = parsePipelineIdentity(args);
  const flags = parsePipelineOptions(args);
  const paths = resolvePipelinePaths(args, systemContext);

  return {
    ...identity,
    system: systemContext,
    paths,
    flags,
    argsRaw: args as Record<string, string | boolean>,
  };
}
