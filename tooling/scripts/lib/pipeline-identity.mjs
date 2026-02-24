export function parsePipelineIdentity(args) {
  return {
    repoRoot: process.cwd(),
    figmaUrl: String(args.url || "").trim(),
    figmaToken: String(args["figma-token"] || process.env.FIGMA_TOKEN || "").trim(),
  };
}
