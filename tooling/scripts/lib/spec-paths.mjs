import path from "node:path";

export function buildSpecOutputPath(args, specRoot, componentSlug, nodeId) {
  if (args.output) return path.resolve(args.output);
  if (componentSlug)
    return path.join(path.resolve(specRoot), `${componentSlug}.yml`);
  if (nodeId)
    return path.join(
      path.resolve(specRoot),
      `component_${nodeId.replace(":", "_")}.yml`,
    );
  return "";
}
