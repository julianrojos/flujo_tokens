/**
 * Capture Path Resolver
 *
 * Resolves documentation paths for capture operations.
 */

import * as path from 'node:path';

import type { CaptureContext, DocsPaths } from '../types/capture-path-resolver.js';

/**
 * Resolve documentation paths for a component slug.
 */
export function resolveDocsPaths(params: {
  ctx: CaptureContext;
  docsRootOverride?: string;
  slug: string;
}): DocsPaths {
  const { ctx, docsRootOverride, slug } = params;
  const docsRoot = docsRootOverride || ctx.paths.docs;
  const docsRootResolved = path.resolve(docsRoot);

  const componentDocsDir =
    path.basename(docsRootResolved) === 'components'
      ? docsRootResolved
      : path.join(docsRootResolved, 'components');

  const docsRootDir =
    path.basename(docsRootResolved) === 'components'
      ? path.dirname(docsRootResolved)
      : docsRootResolved;

  return {
    docsRootDir,
    componentDocsDir,
    docPath: path.join(componentDocsDir, `${slug}.md`),
    specPath: path.join(docsRootDir, '_spec', 'components', `${slug}.yml`),
  };
}
