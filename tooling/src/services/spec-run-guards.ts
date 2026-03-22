/**
 * Spec Run Guards
 *
 * Assertion functions for spec generation pipeline gates.
 */

export interface SpecBypassPolicyArgs {
  force?: boolean;
  skipValidation?: boolean;
  allowNonEvidenceUpdates?: boolean;
}

export interface SpecFigmaSourceArgs {
  figmaUrl?: string;
  nodeId?: string;
  rawComponentName?: string;
}

/**
 * Assert bypass policy for validation and evidence gates.
 * Throws error if bypass flags are used without explicit force.
 *
 * @param args - Bypass policy arguments
 * @throws Error if bypass is not properly authorized
 */
export function assertBypassPolicy(args: SpecBypassPolicyArgs): void {
  const { force, skipValidation, allowNonEvidenceUpdates } = args;

  if (skipValidation && !force) {
    throw new Error(
      'Validation gate bypass requires explicit force.\n' +
        'Use `--skip-validation true --force true` only for exceptional cases.'
    );
  }

  if (allowNonEvidenceUpdates && !force) {
    throw new Error(
      'Evidence gate bypass requires explicit force.\n' +
        'Use `--allow-non-evidence-updates true --force true` only for exceptional cases.'
    );
  }
}

/**
 * Assert that a valid Figma source is provided.
 * Throws error if no source (url, nodeId, or componentName) is provided.
 *
 * @param args - Figma source arguments
 * @throws Error if no Figma source is provided
 */
export function assertFigmaSourceProvided(args: SpecFigmaSourceArgs): void {
  const { figmaUrl, nodeId, rawComponentName } = args;

  if (!figmaUrl && !nodeId && !rawComponentName) {
    throw new Error(
      'Missing Figma source.\nUse one of:\n' +
        '- --url <figma-url>\n' +
        '- --component-set-node-id <node-id>\n' +
        '- --component-name <name> (less deterministic)'
    );
  }
}

/**
 * Assert that an output path is provided.
 * Throws error if no output target is specified.
 *
 * @param outputPath - Output path to validate
 * @throws Error if output path is missing
 */
export function assertOutputPath(outputPath: string | undefined): void {
  if (!outputPath) {
    throw new Error('Missing output target.\nProvide --output or --component-name.');
  }
}
