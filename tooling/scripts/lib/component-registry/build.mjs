import fs from "node:fs";
import path from "node:path";

import {
  componentNameToSnakeCase,
} from "../component-name.mjs";
import { isPlainObject } from "../is-plain-object.mjs";
import { normalizeNodeId } from "../node-id.mjs";
import {
  parseMarkdownFrontmatter,
  parseYamlDocument,
} from "../parse-frontmatter.mjs";
import { isTbdMarker } from "../tbd.mjs";
import {
  COMPONENT_REGISTRY_SCHEMA_VERSION,
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
  PIPELINE_STAGE_ORDER,
} from "./constants.mjs";
import {
  fileExists,
  isValidHttpUrl,
  isValidNodeId,
  normalizeDisplayLabel,
  normalizeSortKey,
  stableHash,
  toProjectRelativePath,
} from "./utils.mjs";

const SPEC_STATUS = new Set(["draft", "ready"]);
const DOC_STATUS = new Set(["draft", "ready", "needs-review"]);
const RENDER_PAYLOAD_SUFFIX = ".render-payload.json";

function listFilesByExtension(directoryPath, extension) {
  if (!fs.existsSync(directoryPath)) return [];
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function listSpecSlugs(specsDir) {
  return listFilesByExtension(specsDir, ".yml")
    .map((filePath) => path.basename(filePath, ".yml"))
    .filter((slug) => slug !== "_template");
}

function listDocSlugs(docsDir) {
  return listFilesByExtension(docsDir, ".md")
    .map((filePath) => path.basename(filePath, ".md"))
    .filter((slug) => slug !== "overview");
}

function listProofSlugs(proofsDir) {
  return listFilesByExtension(proofsDir, ".json").map((filePath) =>
    path.basename(filePath, ".json"),
  );
}

function listRenderSlugs(renderDir) {
  return listFilesByExtension(renderDir, ".json")
    .map((filePath) => path.basename(filePath))
    .filter((fileName) => fileName.endsWith(RENDER_PAYLOAD_SUFFIX))
    .map((fileName) => fileName.slice(0, fileName.length - RENDER_PAYLOAD_SUFFIX.length));
}

function normalizeStatus(rawStatus, allowedStatus) {
  const normalized = String(rawStatus || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "missing";
  return allowedStatus.has(normalized) ? normalized : "unknown";
}

function extractMarkdownH1(content) {
  const match = /^#\s+(.+?)\s*$/m.exec(String(content || ""));
  return match ? match[1].trim() : "";
}

function readSpecState(specPath) {
  if (!fileExists(specPath)) {
    return {
      exists: false,
      status: "missing",
      name: "",
      componentSetNodeId: null,
    };
  }

  const spec = parseYamlDocument(
    fs.readFileSync(specPath, "utf8"),
    `component spec (${path.basename(specPath)})`,
  );
  const figma = isPlainObject(spec.figma) ? spec.figma : {};

  const normalizedNodeId = normalizeNodeId(String(figma.component_set_node_id || "").trim());
  const componentSetNodeId = isValidNodeId(normalizedNodeId)
    ? normalizedNodeId
    : null;

  const rawName = String(spec.name || "").trim();
  const name = rawName && !isTbdMarker(rawName) ? rawName : "";

  return {
    exists: true,
    status: normalizeStatus(spec.status, SPEC_STATUS),
    name,
    componentSetNodeId,
  };
}

function readDocState(docPath) {
  if (!fileExists(docPath)) {
    return {
      exists: false,
      status: "missing",
      title: "",
      figmaFileUrl: null,
      componentSetNodeId: null,
    };
  }

  const rawMarkdown = fs.readFileSync(docPath, "utf8");
  const { frontmatter, content } = parseMarkdownFrontmatter(rawMarkdown);
  const frontmatterObj = isPlainObject(frontmatter) ? frontmatter : {};
  const figma = isPlainObject(frontmatterObj.figma) ? frontmatterObj.figma : {};
  const status = normalizeStatus(frontmatterObj.doc_status, DOC_STATUS);

  const fileUrlRaw = String(figma.file_url || "").trim();
  const figmaFileUrl = isValidHttpUrl(fileUrlRaw) ? fileUrlRaw : null;

  const rawNodeId = normalizeNodeId(String(figma.component_set_node_id || "").trim());
  const componentSetNodeId = isValidNodeId(rawNodeId) ? rawNodeId : null;

  return {
    exists: true,
    status,
    title: extractMarkdownH1(content),
    figmaFileUrl,
    componentSetNodeId,
  };
}

function readRenderState(renderPath) {
  if (!fileExists(renderPath)) {
    return {
      exists: false,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(renderPath, "utf8"));
    if (!isPlainObject(parsed) && !Array.isArray(parsed)) {
      throw new Error("render payload must be an object or array.");
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid render payload JSON (${renderPath}): ${reason}`);
  }

  return {
    exists: true,
  };
}

function readVisualProofState(proofPath) {
  if (!fileExists(proofPath)) {
    return {
      exists: false,
      screenshotUrl: null,
      sourceUrl: null,
      nodeId: null,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid visual proof JSON (${proofPath}): ${reason}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid visual proof JSON (${proofPath}): top-level object required.`);
  }

  const screenshotRaw = String(parsed.image_url || parsed.url || "").trim();
  const screenshotUrl = isValidHttpUrl(screenshotRaw) ? screenshotRaw : null;

  const sourceRaw = String(parsed.source_url || "").trim();
  const sourceUrl = isValidHttpUrl(sourceRaw) ? sourceRaw : null;

  const rawNodeId = normalizeNodeId(String(parsed.node_id || "").trim());
  const nodeId = isValidNodeId(rawNodeId) ? rawNodeId : null;

  return {
    exists: true,
    screenshotUrl,
    sourceUrl,
    nodeId,
  };
}

function inferPipelineStage({ spec, doc, render, visualProof }) {
  if (visualProof.exists && visualProof.screenshotUrl) return "visual-proof";
  if (render.exists) return "render";
  if (doc.exists) return "markdown";
  if (spec.exists) return "spec";
  return "missing-spec";
}

function collectSlugs({ specsDir, docsDir, proofsDir, renderDir }) {
  const slugs = new Set();
  for (const slug of listSpecSlugs(specsDir)) slugs.add(slug);
  for (const slug of listDocSlugs(docsDir)) slugs.add(slug);
  for (const slug of listProofSlugs(proofsDir)) slugs.add(slug);
  for (const slug of listRenderSlugs(renderDir)) slugs.add(slug);

  return Array.from(slugs)
    .map((slug) => componentNameToSnakeCase(slug))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

function resolveDisplayName({ slug, specName, docTitle }) {
  if (docTitle) return docTitle;
  if (specName) return normalizeDisplayLabel(specName);
  return normalizeDisplayLabel(slug);
}

function buildComponentEntry({ slug, specsDir, docsDir, proofsDir, renderDir }) {
  const specPath = path.join(specsDir, `${slug}.yml`);
  const docPath = path.join(docsDir, `${slug}.md`);
  const proofPath = path.join(proofsDir, `${slug}.json`);
  const renderPath = path.join(renderDir, `${slug}${RENDER_PAYLOAD_SUFFIX}`);

  const spec = readSpecState(specPath);
  const doc = readDocState(docPath);
  const render = readRenderState(renderPath);
  const visualProof = readVisualProofState(proofPath);

  const componentSetNodeId =
    spec.componentSetNodeId ||
    doc.componentSetNodeId ||
    visualProof.nodeId ||
    null;

  const figmaUrl = doc.figmaFileUrl || visualProof.sourceUrl || null;
  const stage = inferPipelineStage({ spec, doc, render, visualProof });
  const readyForPublish =
    spec.status === "ready" &&
    doc.status === "ready" &&
    Boolean(visualProof.screenshotUrl);

  const entry = {
    slug,
    display_name: resolveDisplayName({
      slug,
      specName: spec.name,
      docTitle: doc.title,
    }),
    paths: {
      spec: toProjectRelativePath(specPath),
      doc: toProjectRelativePath(docPath),
      render_payload: toProjectRelativePath(renderPath),
      visual_proof: toProjectRelativePath(proofPath),
    },
    spec: {
      exists: spec.exists,
      status: spec.status,
    },
    doc: {
      exists: doc.exists,
      status: doc.status,
    },
    figma: {
      file_url: figmaUrl,
      component_set_node_id: componentSetNodeId,
    },
    render: {
      exists: render.exists,
    },
    visual_proof: {
      exists: visualProof.exists,
      screenshot_url: visualProof.screenshotUrl,
    },
    pipeline_stage: stage,
    ready_for_publish: readyForPublish,
  };

  return {
    ...entry,
    fingerprint_sha256: stableHash(entry),
  };
}

function buildSummary(components) {
  const stageCounts = Object.fromEntries(
    PIPELINE_STAGE_ORDER.map((stage) => [stage, 0]),
  );

  for (const component of components) {
    const stage = String(component.pipeline_stage || "missing-spec");
    if (stage in stageCounts) {
      stageCounts[stage] += 1;
    }
  }

  return {
    total_components: components.length,
    with_spec: components.filter((component) => component.spec.exists).length,
    with_doc: components.filter((component) => component.doc.exists).length,
    with_render_payload: components.filter((component) => component.render.exists)
      .length,
    with_visual_proof: components.filter(
      (component) => component.visual_proof.exists && component.visual_proof.screenshot_url,
    ).length,
    ready_for_publish: components.filter((component) => component.ready_for_publish)
      .length,
    by_pipeline_stage: stageCounts,
  };
}

export function buildComponentRegistry({
  specsDir = DEFAULT_COMPONENT_SPECS_DIR,
  docsDir = DEFAULT_COMPONENT_DOCS_DIR,
  proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
  renderDir = DEFAULT_RENDER_PAYLOADS_DIR,
} = {}) {
  const slugs = collectSlugs({
    specsDir: path.resolve(specsDir),
    docsDir: path.resolve(docsDir),
    proofsDir: path.resolve(proofsDir),
    renderDir: path.resolve(renderDir),
  });

  const components = slugs
    .map((slug) =>
      buildComponentEntry({
        slug,
        specsDir: path.resolve(specsDir),
        docsDir: path.resolve(docsDir),
        proofsDir: path.resolve(proofsDir),
        renderDir: path.resolve(renderDir),
      }),
    )
    .sort((a, b) => {
      const bySlug = a.slug.localeCompare(b.slug, "en", { sensitivity: "base" });
      if (bySlug !== 0) return bySlug;
      return normalizeSortKey(a.display_name).localeCompare(
        normalizeSortKey(b.display_name),
        "en",
        { sensitivity: "base" },
      );
    });

  const registryCore = {
    schema_version: COMPONENT_REGISTRY_SCHEMA_VERSION,
    components,
    summary: buildSummary(components),
  };

  return {
    ...registryCore,
    fingerprint_sha256: stableHash(registryCore),
  };
}
