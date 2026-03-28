import {
  buildComponentUsageIndex,
  buildTokenCollectionTrees,
} from "./registry-artifacts-service.mjs";

function createPipelineStage(item) {
  if (!item.spec.exists) return "missing-spec";
  if (!item.doc.exists) return "spec";
  if (!item.visual_proof.exists) return "markdown";
  return "visual-proof";
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
    const component = {
      slug: row.slug,
      display_name: row.name,
      paths: {
        spec: `design-systems/${sysCtx.systemId}/docs/_spec/components/${row.slug}.yml`,
        doc: specEntry?.markdownPath || `design-systems/${sysCtx.systemId}/docs/components/${row.slug}.md`,
        visual_proof: proofEntry?.imagePath || null,
      },
      spec: {
        exists: Boolean(specEntry),
        status: row.status || "draft",
      },
      doc: {
        exists: Boolean(specEntry),
        status: specEntry?.docStatus || "draft",
      },
      figma: {
        file_url: row.figmaFileUrl || null,
        component_set_node_id: row.figmaComponentSetNodeId || null,
      },
      visual_proof: {
        exists: Boolean(proofEntry),
        screenshot_url: proofEntry?.screenshotUrl || null,
        image_path: proofEntry?.imagePath || null,
      },
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
