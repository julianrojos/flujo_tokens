/**
 * Style Reference Module
 *
 * Resolves style reference paths for component documentation.
 */

/**
 * Options for resolving style reference path.
 */
export interface ResolveStyleReferencePathOptions {
  componentDocsDir: string;
  outputPath: string;
}

/**
 * Resolve the path to the style reference file.
 */
export function resolveStyleReferencePath(
  options: ResolveStyleReferencePathOptions
): string;
