import path from "node:path";

import { normalizeComponentName } from "./component-name.mjs";
import { normalizeNodeId } from "./node-id.mjs";
import { buildSpecOutputPath } from "./spec-paths.mjs";
import { parseFigmaUrl } from "./spec-source.mjs";
import {
  assertBypassPolicy,
  assertFigmaSourceProvided,
  assertOutputPath,
} from "./spec-run-guards.mjs";

export function createSpecRunContext({ args, ctx }) {
  const figmaUrl = String(args.url || "").trim();
  const explicitNodeId = normalizeNodeId(args["component-set-node-id"] || "");
  const rawComponentName = String(args["component-name"] || "").trim();
  const normalizedName = normalizeComponentName(rawComponentName);
  const componentName = normalizedName.displayName;
  const componentSlug = normalizedName.fileSlug;
  const specRoot = args["spec-root"] || ctx.paths.specs;
  const resolvedSpecRoot = path.resolve(specRoot);
  const docsRootDir = ctx.paths.docs;
  const templatePath = path.resolve(args.template || path.join(resolvedSpecRoot, "_template.yml"));
  const registryPath = path.resolve(args.registry || ctx.paths.tokenRegistry);
  const force = String(args.force || "false") === "true";
  const skipValidation = String(args["skip-validation"] || "false") === "true";
  const allowNonEvidenceUpdates =
    String(args["allow-non-evidence-updates"] || "false") === "true";
  const agent = args.agent || "auto";

  assertBypassPolicy({ force, skipValidation, allowNonEvidenceUpdates });

  const parsedUrl = parseFigmaUrl(figmaUrl);
  const fileKeyFromUrl = parsedUrl.fileKey;
  const nodeId = explicitNodeId || parsedUrl.nodeId;

  assertFigmaSourceProvided({ figmaUrl, nodeId, rawComponentName });

  const outputPath = buildSpecOutputPath(args, specRoot, componentSlug, nodeId);
  assertOutputPath(outputPath);

  const overviewPath = path.resolve(path.join(ctx.paths.docs, "overview.md"));
  const registryIndexPath = path.resolve(ctx.paths.registry);
  const allowedWritePaths = [outputPath, overviewPath, registryIndexPath];

  return {
    figmaUrl,
    componentName,
    componentSlug,
    specRoot,
    resolvedSpecRoot,
    docsRootDir,
    templatePath,
    registryPath,
    skipValidation,
    allowNonEvidenceUpdates,
    agent,
    fileKeyFromUrl,
    nodeId,
    outputPath,
    overviewPath,
    registryIndexPath,
    allowedWritePaths,
  };
}
