import { resolveSystemContextSafe } from "./system-context.mjs";
import { parsePipelineOptions } from "./pipeline-options.mjs";
import { resolvePipelinePaths } from "./pipeline-path-resolver.mjs";
import { parsePipelineIdentity } from "./pipeline-identity.mjs";

export function createPipelineContext(args) {
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
