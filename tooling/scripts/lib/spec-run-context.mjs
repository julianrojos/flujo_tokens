import path from "node:path";

import { normalizeComponentName } from "./component-name.mjs";
import { normalizeNodeId } from "./node-id.mjs";
import { buildSpecOutputPath } from "./spec-paths.mjs";
import { resolveFigmaSource } from "./spec-source.mjs";
import {
  assertBypassPolicy,
  assertOutputPath,
} from "./spec-run-guards.mjs";

export function createSpecRunContext({ context, args }) {
  const figmaUrl = context.figmaUrl;
  const explicitNodeId = normalizeNodeId(args["component-set-node-id"] || "");
  const rawComponentName = String(args["component-name"] || "").trim();
  const normalizedName = normalizeComponentName(rawComponentName);
  const componentName = normalizedName.displayName;
  const componentSlug = normalizedName.fileSlug;
  const specRoot = args["spec-root"] || context.system.paths.specs;
  const resolvedSpecRoot = context.paths.resolvedSpecRoot;
  const docsRootDir = context.paths.docsRootDir;
  const templatePath = context.paths.templatePath;
  const registryPath = context.paths.tokenRegistryPath;
  const force = Boolean(context.flags?.force);
  const skipValidation = Boolean(context.flags?.skipValidation);
  const allowNonEvidenceUpdates = Boolean(context.flags?.allowNonEvidenceUpdates);
  const agent = context.flags?.agent || "auto";

  assertBypassPolicy({ force, skipValidation, allowNonEvidenceUpdates });

  const { fileKeyFromUrl, nodeId } = resolveFigmaSource({
    figmaUrl,
    explicitNodeId,
    rawComponentName,
  });

  const outputPath = buildSpecOutputPath(args, specRoot, componentSlug, nodeId);
  assertOutputPath(outputPath);

  const overviewPath = context.paths.overviewPath;
  const databaseUrl = context.paths.databaseUrl;
  const allowedWritePaths = [outputPath, overviewPath];

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
    databaseUrl,
    allowedWritePaths,
  };
}
