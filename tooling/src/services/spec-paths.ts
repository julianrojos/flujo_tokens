/**
 * Spec Paths Utilities
 *
 * Build output paths for spec YAML files.
 */
import * as path from 'node:path';

export interface SpecPathsArgs {
  output?: string;
  component?: string;
  componentSetNodeId?: string;
}

/**
 * Build the output path for a spec YAML file.
 * Priority: explicit output > component slug > node ID
 *
 * @param args - Command arguments
 * @param specRoot - Root directory for specs
 * @param componentSlug - Component slug (snake_case name)
 * @param nodeId - Figma node ID (optional)
 * @returns Resolved output path, or empty string if none provided
 */
export function buildSpecOutputPath(
  args: SpecPathsArgs,
  specRoot: string,
  componentSlug?: string,
  nodeId?: string
): string {
  // Guard: output must be a non-empty string (not boolean from CLI parsing)
  if (typeof args.output === 'string' && args.output.length > 0) {
    return path.resolve(args.output);
  }
  if (componentSlug) return path.join(path.resolve(specRoot), `${componentSlug}.yml`);
  if (nodeId) {
    return path.join(
      path.resolve(specRoot),
      `component_${nodeId.replace(':', '_')}.yml`
    );
  }
  return '';
}
