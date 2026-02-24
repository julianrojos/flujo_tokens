import path from "node:path";

export function mapCaptureTargetForReport(target, repoRoot) {
  return {
    slug: target.slug,
    node_id: target.nodeId,
    kind: target.kind,
    page_name: target.pageName,
    markdown_path: path.relative(repoRoot, target.markdownPath),
    spec_path: path.relative(repoRoot, target.specPath),
    spec_exists: target.specExists,
    figma_url: target.nodeUrl,
    spec_exhibits: target.specExhibits
      ? {
          specs_node_id: target.specExhibits.specsNodeId || null,
          anatomy: target.specExhibits.anatomy || null,
          properties: target.specExhibits.properties || null,
          layout: target.specExhibits.layout || null,
        }
      : null,
  };
}

export function createCaptureReport({
  dryRun,
  descriptor,
  requested,
  tokenBootstrap,
  tokenCompile,
  sourceCandidates,
  targets,
  skipped,
  repoRoot,
}) {
  return {
    ok: true,
    dryRun,
    source: {
      figma_url: descriptor.sourceUrl,
      file_key: descriptor.fileKey,
      node_id_from_url: descriptor.nodeIdFromUrl || null,
    },
    requested,
    tokens_bootstrap: tokenBootstrap,
    tokens_compile: tokenCompile,
    total_candidates: sourceCandidates.length,
    targets_total: targets.length,
    targets: targets.map((target) => mapCaptureTargetForReport(target, repoRoot)),
    captured: [],
    failed: [],
    skipped,
    indices_refreshed: false,
  };
}
