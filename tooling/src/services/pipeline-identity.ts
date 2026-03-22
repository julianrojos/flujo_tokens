/**
 * Pipeline Identity
 *
 * Parse Figma identity information from CLI arguments.
 */

export interface PipelineIdentity {
  repoRoot: string;
  figmaUrl: string;
  figmaToken: string;
}

export interface PipelineIdentityArgs {
  url?: string;
  'figma-token'?: string;
  system?: string;  // Required for resolveSystemContextSafe
  [key: string]: unknown;
}

/**
 * Parse pipeline identity from CLI arguments.
 */
export function parsePipelineIdentity(args: PipelineIdentityArgs): PipelineIdentity {
  return {
    repoRoot: process.cwd(),
    figmaUrl: String(args.url || '').trim(),
    figmaToken: String(args['figma-token'] || process.env.FIGMA_TOKEN || '').trim(),
  };
}
