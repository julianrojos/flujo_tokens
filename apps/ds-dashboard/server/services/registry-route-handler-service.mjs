import {
  buildComponentUsageIndex,
  buildTokenCollectionTrees,
} from "./registry-artifacts-service.mjs";
import fs from "node:fs/promises";
import { resolveRepoFilePath } from "../lib/request-file-helpers.mjs";
import { normalizeVisualProofFromRepositoryEntry } from "../lib/visual-proof-normalizer.ts";

async function fileExistsWithinRepo(repoRoot, relativePath, cache) {
  const resolved = resolveRepoFilePath(repoRoot, relativePath);
  if (!resolved) return false;
  if (cache.has(resolved)) return cache.get(resolved);
  const exists = await fs
    .access(resolved)
    .then(() => true)
    .catch(() => false);
  cache.set(resolved, exists);
  return exists;
}

function createPipelineStage(item) {
  if (!item.spec.exists) return "missing-spec";
  if (!item.doc.exists) return "spec";
  if (!item.visual_proof.exists) return "markdown";
  return "visual-proof";
}

function emptyVisualProof() {
  return {
    exists: false,
    screenshot_url: null,
    image_path: null,
    captured_at: null,
    node_id: null,
    image_sha256: null,
    image_bytes: null,
    image_content_type: null,
    image_width: null,
    image_height: null,
    variants_count: 0,
    variants: [],
  };
}

export async function handleComponentRegistryRoute(c, deps) {
  const { failJson, getSystemContext, componentRepo } = deps;
  if (!componentRepo) {
    return failJson(c, 500, {
      code: "internal.component_repo_missing",
      userMessage: "Component repository is not initialized.",
      recoverable: false,
    });
  }
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const rows = componentRepo.getAll(sysCtx.systemId);
  const existsCache = new Map();
  const components = await Promise.all(rows.map(async (row) => {
    const specEntry = Array.isArray(row.specs) && row.specs.length > 0 ? row.specs[0] : null;
    const proofEntry = Array.isArray(row.visualProofs) && row.visualProofs.length > 0 ? row.visualProofs[0] : null;
    const docPath = specEntry?.markdownPath || `design-systems/${sysCtx.systemId}/docs/components/${row.slug}.md`;
    const specPath = `design-systems/${sysCtx.systemId}/docs/_spec/components/${row.slug}.yml`;
    const visualProofFromDb = normalizeVisualProofFromRepositoryEntry(proofEntry) || emptyVisualProof();
    const visualProofPath =
      typeof visualProofFromDb.image_path === "string" && visualProofFromDb.image_path
        ? visualProofFromDb.image_path
        : null;
    const [docExists, specExists, visualProofExists] = await Promise.all([
      fileExistsWithinRepo(sysCtx.repoRoot, docPath, existsCache),
      fileExistsWithinRepo(sysCtx.repoRoot, specPath, existsCache),
      visualProofPath
        ? fileExistsWithinRepo(sysCtx.repoRoot, visualProofPath, existsCache)
        : Promise.resolve(false),
    ]);
    const visualProof = {
      ...visualProofFromDb,
      exists: visualProofPath
        ? visualProofExists
        : Boolean(visualProofFromDb.screenshot_url) ||
          Number(visualProofFromDb.variants_count || 0) > 0 ||
          (Array.isArray(visualProofFromDb.variants) && visualProofFromDb.variants.length > 0),
    };
    const component = {
      slug: row.slug,
      display_name: row.name,
      paths: {
        spec: specPath,
        doc: docPath,
        visual_proof: visualProofPath,
      },
      spec: {
        exists: specExists,
        status: row.status || "draft",
      },
      doc: {
        exists: docExists,
        status: specEntry?.docStatus || "draft",
      },
      figma: {
        file_url: row.figmaFileUrl || null,
        component_set_node_id: row.figmaComponentSetNodeId || null,
      },
      visual_proof: visualProof,
      pipeline_stage: "missing-spec",
      ready_for_publish: false,
    };
    component.pipeline_stage = createPipelineStage(component);
    component.ready_for_publish = component.pipeline_stage === "visual-proof";
    return component;
  }));
  const summary = {
    total_components: 0,
    with_spec: 0,
    with_doc: 0,
    with_visual_proof: 0,
    ready_for_publish: 0,
    by_pipeline_stage: {
      "missing-spec": 0,
      spec: 0,
      markdown: 0,
      "visual-proof": 0,
    },
  };
  for (const item of components) {
    summary.total_components++;
    if (item.spec.exists) summary.with_spec++;
    if (item.doc.exists) summary.with_doc++;
    if (item.visual_proof.exists) summary.with_visual_proof++;
    if (item.ready_for_publish) summary.ready_for_publish++;
    summary.by_pipeline_stage[item.pipeline_stage]++;
  }
  return c.json({
    schema_version: 1,
    components,
    summary,
  });
}

export async function handleComponentUsageIndexRoute(c, deps) {
  const { failJson, getSystemContext, componentRepo } = deps;
  if (!componentRepo) {
    return failJson(c, 500, {
      code: "internal.component_repo_missing",
      userMessage: "Component repository is not initialized.",
      recoverable: false,
    });
  }
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const rows = componentRepo.getAll(sysCtx.systemId);
  const registry = {
    components: rows.map((row) => ({
      slug: row.slug,
      paths: {
        spec: `design-systems/${sysCtx.systemId}/docs/_spec/components/${row.slug}.yml`,
      },
    })),
  };
  return c.json(buildComponentUsageIndex(registry.components, sysCtx.repoRoot));
}

export async function handleTokenRegistryRoute(c, deps) {
  const { failJson, getSystemContext, tokenRepo } = deps;
  if (!tokenRepo) {
    return failJson(c, 500, {
      code: "internal.token_repo_missing",
      userMessage: "Token repository is not initialized.",
      recoverable: false,
    });
  }
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const registry = tokenRepo.getTokenRegistry(sysCtx.systemId);
  return c.json(registry);
}

export async function handleTokenCollectionTreesRoute(c, deps) {
  const { failJson, getSystemContext, tokenRepo } = deps;
  if (!tokenRepo) {
    return failJson(c, 500, {
      code: "internal.token_repo_missing",
      userMessage: "Token repository is not initialized.",
      recoverable: false,
    });
  }
  const sysCtx = getSystemContext(c.req.header("x-ds-system"));
  const registry = tokenRepo.getTokenRegistry(sysCtx.systemId);
  return c.json(buildTokenCollectionTrees(registry.entries));
}
