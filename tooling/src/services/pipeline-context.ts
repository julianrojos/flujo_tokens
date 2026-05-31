/**
 * Pipeline Context
 *
 * Create unified pipeline context from CLI arguments.
 */
import {
  loadDesignSystemsConfigAsync,
  resolveSystemContextSafe,
} from '../utils/system-context.js';
import {
  parsePipelineOptions,
  type PipelineFlags,
} from './pipeline-options.js';
import {
  resolvePipelinePaths,
  type PipelinePaths,
} from './pipeline-path-resolver.js';
import {
  parsePipelineIdentity,
  type PipelineIdentity,
  type PipelineIdentityArgs,
} from './pipeline-identity.js';

export interface PipelineContext extends PipelineIdentity {
  system: ReturnType<typeof resolveSystemContextSafe>;
  paths: PipelinePaths;
  flags: PipelineFlags;
  argsRaw: PipelineIdentityArgs;
}

/**
 * Create pipeline context from CLI arguments.
 */
export async function createPipelineContext(
  args: PipelineIdentityArgs,
): Promise<PipelineContext> {
  await loadDesignSystemsConfigAsync();
  const systemContext = resolveSystemContextSafe({ system: args.system });

  const identity = parsePipelineIdentity(args);
  const flags = parsePipelineOptions(args);
  const paths = resolvePipelinePaths(args, systemContext);

  return {
    ...identity,
    system: systemContext,
    paths,
    flags,
    argsRaw: args,
  };
}
