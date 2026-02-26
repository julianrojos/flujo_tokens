/**
 * Capture Path Resolver
 *
 * Resolves documentation paths for capture targets.
 */

import * as path from 'node:path';

import type { ScriptSystemContext } from '../utils/system-context.js';

/**
 * Path resolution parameters.
 */
export interface ResolveDocsPathsParams {
  /** System context. */
  ctx: Pick<ScriptSystemContext, 'id' | 'paths'>;
  /** Docs root override. */
  docsRootOverride?: string | null;
  /** Component slug. */
  slug: string;
}

/**
 * Resolved documentation paths.
 */
export interface ResolvedDocsPaths {
  /** Docs root directory. */
  docsRootDir: string;
  /** Component docs directory. */
  componentDocsDir: string;
  /** Markdown file path. */
  markdownPath: string;
  /** Spec file path. */
  specPath: string;
}

/**
 * Resolve documentation paths for a capture target.
 *
 * @param params - Path resolution parameters.
 * @returns Resolved paths.
 */
export function resolveDocsPaths(params: ResolveDocsPathsParams): ResolvedDocsPaths {
  const { ctx, docsRootOverride, slug } = params;

  const docsRoot = docsRootOverride || ctx.paths?.docs || 'docs';
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
    markdownPath: path.join(componentDocsDir, `${slug}.md`),
    specPath: path.join(docsRootDir, '_spec', 'components', `${slug}.yml`),
  };
}
