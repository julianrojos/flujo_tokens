import fs from "node:fs";
import path from "node:path";

import { componentNameToDisplayName } from "./component-name.mjs";
import { resolveInferredSlug } from "./capture-targets.mjs";

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
  resolveDocsPaths,
  buildFigmaNodeUrl,
  classifyTargetKind,
  renderEnrichedMarkdownSeed,
  injectExtractedSpecSectionsIntoMarkdown,
  buildMarkdownSeed,
  writeTextAtomic,
  stderrWrite = process.stderr.write.bind(process.stderr),
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
    const markdownExists = fs.existsSync(resolvedPaths.markdownPath);
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

    if (!requireExistingDoc && !markdownExists) {
      try {
        let seed;
        if (extractedNodeSpec) {
          seed = renderEnrichedMarkdownSeed({
            slug: inferredSlug,
            displayName:
              componentNameToDisplayName(String(candidate.name || "").trim()) ||
              inferredSlug,
            nodeUrl,
            nodeId,
            spec: extractedNodeSpec,
          });
          const enrichedSeed = injectExtractedSpecSectionsIntoMarkdown(
            seed,
            extractedNodeSpec,
            specExhibits,
          );
          seed = enrichedSeed.content;
        }
        if (!seed) {
          seed = buildMarkdownSeed({
            slug: inferredSlug,
            candidateName: String(candidate.name || "").trim() || inferredSlug,
            nodeUrl,
            nodeId,
          });
        }
        writeTextAtomic(resolvedPaths.markdownPath, seed);
      } catch (error) {
        skipped.push({
          slug: inferredSlug,
          node_id: nodeId,
          name: String(candidate.name || "").trim() || inferredSlug,
          reason: "markdown-create-failed",
          markdown_path: path.relative(repoRoot, resolvedPaths.markdownPath),
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }

    if (injectDocSpecs && markdownExists && extractedNodeSpec) {
      try {
        const currentMarkdown = fs.readFileSync(resolvedPaths.markdownPath, "utf8");
        const injection = injectExtractedSpecSectionsIntoMarkdown(
          currentMarkdown,
          extractedNodeSpec,
          specExhibits,
        );
        if (injection.changed) {
          writeTextAtomic(resolvedPaths.markdownPath, injection.content);
        }
      } catch (error) {
        skipped.push({
          slug: inferredSlug,
          node_id: nodeId,
          name: String(candidate.name || "").trim() || inferredSlug,
          reason: "markdown-enrich-failed",
          markdown_path: path.relative(repoRoot, resolvedPaths.markdownPath),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const specExists = fs.existsSync(resolvedPaths.specPath);

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
