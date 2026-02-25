import fs from "node:fs/promises";
import yaml from "js-yaml";
import { componentNameToDisplayName } from "./component-name.mjs";
import path from "node:path";
import { resolveInferredSlug } from "./capture-targets.mjs";
import { resolveDocsPaths } from "./capture-path-resolver.mjs";

function buildNodeErrorMessage(prefix, nodeId, error) {
  const detail = error instanceof Error ? error.message : String(error);
  return `[capture] ${prefix} for ${nodeId}: ${detail}\n`;
}

function mapSpecExhibit(sourceNodeId, imagesByNodeId) {
  const normalizedNodeId = String(sourceNodeId || "").trim();
  if (!normalizedNodeId) return null;
  const imageUrl = String(imagesByNodeId[normalizedNodeId] || "").trim();
  return {
    nodeId: normalizedNodeId,
    imageUrl: imageUrl || null,
  };
}

async function writeDualAtomic(ymlPath, ymlContent, mdPath, mdContent) {
  const ts = Date.now();
  const ymlTemp = `${ymlPath}.tmp.${ts}`;
  const mdTemp = `${mdPath}.tmp.${ts}`;
  try {
    await fs.writeFile(ymlTemp, ymlContent, "utf8");
    await fs.writeFile(mdTemp, mdContent, "utf8");
    await fs.rename(ymlTemp, ymlPath);
    await fs.rename(mdTemp, mdPath);
  } catch (error) {
    await fs.unlink(ymlTemp).catch(() => {});
    await fs.unlink(mdTemp).catch(() => {});
    throw error;
  }
}


export async function buildCaptureTargets({
  sourceCandidates,
  descriptor,
  ctx,
  docsRootOverride,
  applySlugOverride,
  componentSlugOverride,
  slugByNodeFromRegistry,
  slugByNodeFromSpecs,
  requireExistingDoc,
  injectDocSpecs,
  includeSpecExhibits,
  figmaToken,
  repoRoot,
  ensureFilePayload,
  fetchFigmaNodes,
  fetchFigmaImages,
  extractComponentSpec,
  resolveSpecExhibitNodeIds,
  buildFigmaNodeUrl,
  classifyTargetKind,
  renderEnrichedMarkdownSeed,
  injectSpecZones,
  buildMarkdownSeed,
  writeTextAtomic,
  stderrWrite = process.stderr.write.bind(process.stderr),
  markdownExistsFn,
  specExistsFn,
  readMarkdownContentFn,
}) {
  const targets = [];
  const skipped = [];

  for (const candidate of sourceCandidates) {
    const nodeId = String(candidate.node_id || "").trim();
    if (!nodeId) continue;
    const inferredSlug = resolveInferredSlug({
      applySlugOverride,
      componentSlugOverride,
      slugByNodeFromRegistry,
      slugByNodeFromSpecs,
      nodeId,
      candidateName: candidate.name,
    });

    if (!inferredSlug) {
      skipped.push({
        node_id: nodeId,
        name: String(candidate.name || "").trim() || nodeId,
        reason: "slug-resolution-failed",
      });
      continue;
    }

    const resolvedPaths = resolveDocsPaths({
      ctx,
      docsRootOverride,
      slug: inferredSlug,
    });
    const nodeUrl = buildFigmaNodeUrl(descriptor, nodeId) || descriptor.sourceUrl;
    const markdownExists = markdownExistsFn(resolvedPaths.markdownPath);
    let extractedNodeSpec = null;
    let specExhibits = null;
    const shouldExtractNodeSpec = !markdownExists || (markdownExists && injectDocSpecs);

    if (shouldExtractNodeSpec) {
      try {
        const fullNodePayload = await fetchFigmaNodes({
          fileKey: descriptor.fileKey,
          nodeIds: [nodeId],
          token: figmaToken,
        });
        const nodeEntry = fullNodePayload?.nodes?.[nodeId]?.document ?? null;
        if (nodeEntry) {
          extractedNodeSpec = extractComponentSpec(nodeEntry);
        }
      } catch (error) {
        stderrWrite(buildNodeErrorMessage("Node extraction failed", nodeId, error));
      }
    }

    if (shouldExtractNodeSpec && includeSpecExhibits) {
      try {
        const fileTree = await ensureFilePayload();
        const exhibitNodeIds = resolveSpecExhibitNodeIds({
          figmaFilePayload: fileTree,
          targetNodeId: nodeId,
        });
        if (exhibitNodeIds) {
          const exportNodeIds = Array.from(
            new Set(
              [
                exhibitNodeIds.anatomyNodeId,
                exhibitNodeIds.propertiesNodeId,
                exhibitNodeIds.layoutNodeId,
              ].filter(Boolean),
            ),
          );
          let imagesByNodeId = {};
          if (exportNodeIds.length > 0) {
            const imagesPayload = await fetchFigmaImages({
              fileKey: descriptor.fileKey,
              nodeIds: exportNodeIds,
              token: figmaToken,
              format: "png",
              scale: 2,
            });
            imagesByNodeId =
              imagesPayload?.images && typeof imagesPayload.images === "object"
                ? imagesPayload.images
                : {};
          }

          specExhibits = {
            specsNodeId: exhibitNodeIds.specsNodeId || null,
            anatomy: mapSpecExhibit(exhibitNodeIds.anatomyNodeId, imagesByNodeId),
            properties: mapSpecExhibit(exhibitNodeIds.propertiesNodeId, imagesByNodeId),
            layout: mapSpecExhibit(exhibitNodeIds.layoutNodeId, imagesByNodeId),
          };
        }
      } catch (error) {
        stderrWrite(buildNodeErrorMessage("Specs exhibit extraction failed", nodeId, error));
      }
    }

    if (requireExistingDoc && !markdownExists) {
      skipped.push({
        slug: inferredSlug,
        node_id: nodeId,
        name: String(candidate.name || "").trim() || inferredSlug,
        reason: "markdown-missing",
        markdown_path: path.relative(repoRoot, resolvedPaths.markdownPath),
      });
      continue;
    }

    let finalWritePayloads = null;

    try {
      if (extractedNodeSpec) {
        /** @type {any} */
        let currentYml = {};
        try {
          if (specExistsFn(resolvedPaths.specPath)) {
            currentYml = yaml.load(await fs.readFile(resolvedPaths.specPath, "utf-8")) || {};
          } else {
            currentYml = { name: inferredSlug, figma: { component_set_node_id: nodeId } };
          }
        } catch { /* assume empty/corrupt and overwrite safely */ }

        currentYml.anatomy = extractedNodeSpec.anatomy;
        currentYml.properties = extractedNodeSpec.properties;
        currentYml.variants = extractedNodeSpec.variants;
        currentYml.layout = extractedNodeSpec.layout;

        const mergedYmlText = yaml.dump(currentYml, { lineWidth: -1 });

        let mdToWrite = null;
        if (markdownExists && injectDocSpecs) {
          const currentMarkdown = readMarkdownContentFn(resolvedPaths.markdownPath);
          const newMd = injectSpecZones(currentMarkdown, currentYml, inferredSlug);
          if (newMd !== currentMarkdown || !specExistsFn(resolvedPaths.specPath)) {
            mdToWrite = newMd;
          }
        } else if (!markdownExists && !requireExistingDoc) {
          const seed = renderEnrichedMarkdownSeed({
            slug: inferredSlug,
            displayName: componentNameToDisplayName(String(candidate.name || "").trim()) || inferredSlug,
            nodeUrl,
            nodeId,
            spec: currentYml,
          });
          mdToWrite = injectSpecZones(seed, currentYml, inferredSlug);
        }

        if (mdToWrite !== null || (!specExistsFn(resolvedPaths.specPath) && injectDocSpecs)) {
          finalWritePayloads = { yml: mergedYmlText, md: mdToWrite || readMarkdownContentFn(resolvedPaths.markdownPath) };
        }
      } else if (!markdownExists && !requireExistingDoc) {
        const seed = buildMarkdownSeed({
          slug: inferredSlug,
          candidateName: String(candidate.name || "").trim() || inferredSlug,
          nodeUrl,
          nodeId,
        });
        writeTextAtomic(resolvedPaths.markdownPath, seed);
      }
    } catch (error) {
      skipped.push({
        slug: inferredSlug,
        node_id: nodeId,
        name: String(candidate.name || "").trim() || inferredSlug,
        reason: "markdown-enrich-failed",
        markdown_path: resolvedPaths.markdownPath,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (finalWritePayloads) {
      try {
        await writeDualAtomic(resolvedPaths.specPath, finalWritePayloads.yml, resolvedPaths.markdownPath, finalWritePayloads.md);
      } catch (error) {
        skipped.push({
          slug: inferredSlug,
          node_id: nodeId,
          name: String(candidate.name || "").trim() || inferredSlug,
          reason: "atomic-write-failed",
          markdown_path: resolvedPaths.markdownPath,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }

    const specExists = specExistsFn(resolvedPaths.specPath);

    targets.push({
      slug: inferredSlug,
      nodeId,
      name: String(candidate.name || "").trim() || inferredSlug,
      kind: classifyTargetKind(candidate.kind),
      pageName: String(candidate.page_name || "").trim() || null,
      markdownPath: resolvedPaths.markdownPath,
      specPath: resolvedPaths.specPath,
      specExists,
      nodeUrl,
      specExhibits,
    });
  }

  return { targets, skipped };
}
