import {
  buildComponentUsageIndex,
  buildTokenCollectionTrees,
} from "./registry-artifacts-service.mjs";
import { createHash } from "node:crypto";

import { COMPONENT_CATALOG_SCHEMA_VERSION } from "../lib/catalog-seed-service.mjs";
import { normalizeVisualProofFromRepositoryEntry } from "../lib/visual-proof-normalizer.ts";

function sha256Json(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function emptyVisualProof() {
  return {
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
      status: String(binding?.status || "").trim() || undefined,
      property_path: String(binding?.propertyPath || "").trim() || undefined,
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

export async function handleComponentCatalogRoute(c, deps) {
  const { failJson, getSystemContext, componentRepo } = deps;
  if (!componentRepo) {
    return failJson(c, 500, {
      code: "internal.component_repo_missing",
      userMessage: "Component repository is not initialized.",
      recoverable: false,
    });
  }
  const sysCtx = await getSystemContext(c.req.header("x-ds-system"));
  const rows = await componentRepo.getAll(sysCtx.systemId);
  const components = rows.map((row) => {
    const specExists = row.editorialExists;
    const proofEntry = Array.isArray(row.visualProofs) && row.visualProofs.length > 0 ? row.visualProofs[0] : null;
    const visualProofFromDb = normalizeVisualProofFromRepositoryEntry(proofEntry);
    const visualProof = {
      ...emptyVisualProof(),
      ...(visualProofFromDb || {}),
      variants: Array.isArray(visualProofFromDb?.variants) ? visualProofFromDb.variants : [],
    };
    const componentBase = {
      slug: row.slug,
      display_name: row.name,
      paths: {
        spec: `db://component_editorial/${row.id}`,
      },
      spec: {
        exists: specExists,
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
    };
    return {
      ...componentBase,
      fingerprint_sha256: sha256Json(componentBase),
    };
  });
  const summary = {
    total_components: 0,
    with_spec: 0,
    with_editorial: 0,
  };
  for (const [index, item] of components.entries()) {
    summary.total_components++;
    const sourceRow = rows[index];
    if (Array.isArray(sourceRow?.specs) && sourceRow.specs.length > 0) {
      summary.with_spec++;
    }
    if (item.spec.exists) {
      summary.with_editorial++;
    }
  }
  const responseBase = {
    schema_version: COMPONENT_CATALOG_SCHEMA_VERSION,
    components,
    summary,
  };
  return c.json({
    ...responseBase,
    fingerprint_sha256: sha256Json(responseBase),
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
  const sysCtx = await getSystemContext(c.req.header("x-ds-system"));
  const rows = await componentRepo.getAll(sysCtx.systemId);
  return c.json(
    buildComponentUsageIndex(
      rows.map((row) => ({
        slug: row.slug,
        name: row.name,
        figma: row.figma
          ? {
              componentSetNodeId:
                row.figma.componentSetNodeId ||
                row.figmaComponentSetNodeId ||
                null,
              variants: Array.isArray(row.figma.variants)
                ? row.figma.variants.map((variant) => ({
                    name: variant.name,
                    nodeId: variant.nodeId,
                  }))
                : undefined,
              instanceDependencies: Array.isArray(row.figma.instanceDependencies)
                ? row.figma.instanceDependencies.map((dependency) => ({
                    instanceNodeId: dependency.instanceNodeId,
                    instanceNodeName: dependency.instanceNodeName,
                    usedComponentNodeId: dependency.usedComponentNodeId,
                    usedComponentName: dependency.usedComponentName,
                    usedComponentKey: dependency.usedComponentKey,
                    status: dependency.status,
                  }))
                : undefined,
            }
          : undefined,
      })),
    ),
  );
}

export async function handleTokenCatalogRoute(c, deps) {
  const { failJson, getSystemContext, tokenRepo } = deps;
  if (!tokenRepo) {
    return failJson(c, 500, {
      code: "internal.token_repo_missing",
      userMessage: "Token repository is not initialized.",
      recoverable: false,
    });
  }
  const sysCtx = await getSystemContext(c.req.header("x-ds-system"));
  const catalog = await tokenRepo.getTokenCatalog(sysCtx.systemId);
  return c.json(catalog);
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
  const sysCtx = await getSystemContext(c.req.header("x-ds-system"));
  const registry = await tokenRepo.getTokenCatalog(sysCtx.systemId);
  return c.json(buildTokenCollectionTrees(registry.entries));
}
