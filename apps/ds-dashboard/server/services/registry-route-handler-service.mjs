import {
  buildComponentUsageIndex,
  buildTokenCollectionTrees,
} from "./registry-artifacts-service.mjs";
import { normalizeVisualProofFromRepositoryEntry } from "../lib/visual-proof-normalizer.ts";

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

/**
 * DB-only semantics:
 * A visual proof is considered present when DB evidence exists.
 * We intentionally do not verify file existence on disk here.
 */
function computeVisualProofExists(dbRecord) {
  if (dbRecord.image_path) return true;
  return Boolean(dbRecord.screenshot_url) ||
    Number(dbRecord.variants_count || 0) > 0 ||
    (Array.isArray(dbRecord.variants) && dbRecord.variants.length > 0);
}

function normalizeFigmaVariantsForApi(variants) {
  if (!Array.isArray(variants) || variants.length === 0) return undefined;
  return variants.map((variant) => ({
    name: String(variant?.name || "").trim() || "Variant",
    properties: variant?.properties && typeof variant.properties === "object" ? variant.properties : {},
    node_id: String(variant?.nodeId || "").trim() || undefined,
  }));
}

function normalizeFigmaTokenBindingsForApi(tokenBindings) {
  if (!Array.isArray(tokenBindings) || tokenBindings.length === 0) return undefined;
  return tokenBindings
    .map((binding) => ({
      node_id: String(binding?.nodeId || "").trim(),
      node_name: String(binding?.nodeName || "").trim(),
      field: String(binding?.field || "").trim(),
      variable_id: String(binding?.variableId || "").trim(),
      token_path: String(binding?.tokenPath || "").trim() || undefined,
      mode: String(binding?.mode || "").trim() || undefined,
    }))
    .filter((binding) => binding.node_id && binding.node_name && binding.field && binding.variable_id);
}

function normalizeFigmaLayoutForApi(layoutRows) {
  if (!Array.isArray(layoutRows) || layoutRows.length === 0) return undefined;
  const normalizedRows = [];
  for (const row of layoutRows) {
    const nodeId = String(row?.nodeId || "").trim();
    const nodeName = String(row?.nodeName || "").trim();
    if (!nodeId || !nodeName) continue;
    const parsedDepth = Number(row?.depth);
    normalizedRows.push({
      node_id: nodeId,
      node_name: nodeName,
      depth: Number.isFinite(parsedDepth) ? Math.max(0, Math.floor(parsedDepth)) : 0,
      direction: String(row?.direction || "").trim() || undefined,
      h_sizing: String(row?.hSizing || "").trim() || undefined,
      v_sizing: String(row?.vSizing || "").trim() || undefined,
      alignment_h: String(row?.alignmentH || "").trim() || undefined,
      alignment_v: String(row?.alignmentV || "").trim() || undefined,
      item_spacing: Number.isFinite(Number(row?.itemSpacing))
        ? Number(row.itemSpacing)
        : undefined,
      padding: row?.padding || undefined,
    });
  }
  return normalizedRows.length > 0 ? normalizedRows : undefined;
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
  const components = rows.map((row) => {
    const specEntry = Array.isArray(row.specs) && row.specs.length > 0 ? row.specs[0] : null;
    const proofEntry = Array.isArray(row.visualProofs) && row.visualProofs.length > 0 ? row.visualProofs[0] : null;
    const docPath = typeof specEntry?.markdownPath === "string" && specEntry.markdownPath
      ? specEntry.markdownPath
      : null;
    const visualProofFromDb = normalizeVisualProofFromRepositoryEntry(proofEntry) || emptyVisualProof();
    const visualProofPath =
      typeof visualProofFromDb.image_path === "string" && visualProofFromDb.image_path
        ? visualProofFromDb.image_path
        : null;
    // Preserve explicit screenshot URLs from DB.
    // Do not synthesize screenshot_url from image_path to avoid implying file availability.
    const derivedScreenshotUrl = visualProofFromDb.screenshot_url || null;
    const derivedVariants = Array.isArray(visualProofFromDb.variants)
      ? visualProofFromDb.variants.map((variant) => {
          return {
            ...variant,
            screenshot_url: variant.screenshot_url || null,
          };
        })
      : [];
    const visualProof = {
      ...visualProofFromDb,
      screenshot_url: derivedScreenshotUrl,
      variants: derivedVariants,
      exists: computeVisualProofExists(visualProofFromDb),
    };
    const component = {
      slug: row.slug,
      display_name: row.name,
      paths: {
        spec: `db://component_editorial/${row.id}`,
        doc: docPath,
        visual_proof: visualProofPath,
      },
      spec: {
        exists: row.editorialExists,
        status: row.status || "draft",
      },
      doc: {
        // DB-only semantics: doc.exists means metadata exists in component_specs.
        exists: Boolean(specEntry?.markdownPath),
        status: specEntry?.docStatus || "draft",
      },
      figma: {
        file_url: row.figmaFileUrl || null,
        component_set_node_id: row.figmaComponentSetNodeId || null,
        page_name: row.figma?.pageName || null,
        variants: normalizeFigmaVariantsForApi(row.figma?.variants),
        token_bindings: normalizeFigmaTokenBindingsForApi(row.figma?.tokenBindings),
        layout: normalizeFigmaLayoutForApi(row.figma?.layout),
      },
      visual_proof: visualProof,
      pipeline_stage: "missing-spec",
      ready_for_publish: false,
    };
    component.pipeline_stage = createPipelineStage(component);
    component.ready_for_publish = component.pipeline_stage === "visual-proof";
    return component;
  });
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
  const componentIds = rows.map((row) => row.id);
  const editorialById = componentRepo.getEditorialByComponentIds(componentIds);
  const registry = {
    components: rows.map((row) => {
      const editorial = editorialById.get(row.id) || null;
      return {
        slug: row.slug,
        paths: {
          spec: `db://component_editorial/${row.id}`,
        },
        related_components: Array.isArray(editorial?.relatedComponents)
          ? editorial.relatedComponents.filter((item) => typeof item === "string")
          : [],
      };
    }),
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
