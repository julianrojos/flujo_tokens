/**
 * Pipeline Path Resolver
 *
 * Resolve pipeline paths from CLI arguments and system context.
 */
import * as path from 'node:path';
import type { ScriptSystemContext } from '../utils/system-context.js';
import { PROJECT_ROOT } from '../utils/system-context.js';

export interface PipelinePaths {
  docsRootOverride: string | null;
  docsRootDir: string;
  componentDocsDir: string;
  proofDir: string;
  proofImageDir: string;
  databaseUrl: string;
  tokenRegistryPath: string;
  resolvedSpecRoot: string;
  overviewPath: string;
}

export interface PipelinePathsArgs {
  'docs-root'?: string;
  'proof-dir'?: string;
  'proof-image-dir'?: string;
  'spec-root'?: string;
  registry?: string;
  template?: string;
  [key: string]: unknown;
}

/**
 * Resolve pipeline paths from CLI arguments and system context.
 */
export function resolvePipelinePaths(
  args: PipelinePathsArgs,
  systemContext: ScriptSystemContext
): PipelinePaths {
  const docsRootOverride = args['docs-root'] ? String(args['docs-root']).trim() : null;
  const docsRootInput = docsRootOverride || systemContext.paths.docs;
  const docsRootResolved = path.resolve(docsRootInput);

  // ASSUMPTION: docsRootResolved points to the actual docs root directory,
  // OR explicitly to the "components" directory.
  // If it's explicitly resolving to "components", we climb up one level.
  const isComponentsDir = path.basename(docsRootResolved) === 'components';

  const docsRootDir = isComponentsDir
    ? path.dirname(docsRootResolved)
    : docsRootResolved;

  const componentDocsDir = isComponentsDir
    ? docsRootResolved
    : path.join(docsRootResolved, 'components');

  const proofDir = path.resolve(
    args['proof-dir'] || path.join(systemContext.paths.generated, 'visual-proofs')
  );
  const proofImageDir = path.resolve(
    args['proof-image-dir'] || path.join(systemContext.paths.generated, 'visual-proofs', 'images')
  );

  const specRoot = args['spec-root'] || systemContext.paths.specs;
  const resolvedSpecRoot = path.resolve(specRoot);

  return {
    docsRootOverride,
    docsRootDir,
    componentDocsDir,
    proofDir,
    proofImageDir,
    databaseUrl: systemContext.paths.databaseUrl,
    tokenRegistryPath: path.resolve(
      args.registry || systemContext.paths.tokenRegistry || path.join(docsRootDir, '_generated', 'token-registry.json')
    ),
    resolvedSpecRoot,
    overviewPath: path.resolve(path.join(docsRootDir, 'overview.md')),
  };
}
