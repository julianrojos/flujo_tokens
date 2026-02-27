/**
 * Component Registry Builder
 *
 * Builds component registry from spec, doc, render, and visual proof sources.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { componentNameToSnakeCase } from '../utils/component-name.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { normalizeNodeId } from '../utils/figma-node-id.js';
import { PROJECT_ROOT } from '../utils/system-context.js';
import { parseMarkdownFrontmatter, parseYamlDocument } from '../utils/parse-frontmatter.js';
import { isTbdMarker } from '../utils/tbd.js';
import type {
  ComponentRegistry,
  ComponentRegistryEntry,
  ComponentSpecState,
  ComponentDocState,
  ComponentRenderState,
  ComponentVisualProofState,
  VisualProofVariant,
  PipelineStage,
  BuildRegistryOptions,
} from '../types/component-registry.js';
import {
  COMPONENT_REGISTRY_SCHEMA_VERSION,
  DEFAULT_COMPONENT_DOCS_DIR,
  DEFAULT_COMPONENT_SPECS_DIR,
  DEFAULT_RENDER_PAYLOADS_DIR,
  DEFAULT_VISUAL_PROOFS_DIR,
  PIPELINE_STAGE_ORDER,
} from './component-registry-constants.js';
import {
  fileExists,
  isValidHttpUrl,
  isValidNodeId,
  normalizeDisplayLabel,
  normalizeSortKey,
  stableHash,
  toProjectRelativePath,
} from './component-registry-utils.js';

const SPEC_STATUS = new Set(['draft', 'ready']);
const DOC_STATUS = new Set(['draft', 'ready', 'needs-review']);
const RENDER_PAYLOAD_SUFFIX = '.render-payload.json';

/**
 * List files by extension in a directory.
 */
function listFilesByExtension(directoryPath: string, extension: string): string[] {
  if (!fs.existsSync(directoryPath)) return [];
  return fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/**
 * List spec slugs from directory.
 */
function listSpecSlugs(specsDir: string): string[] {
  const SLUG_REGEX = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
  
  return listFilesByExtension(specsDir, '.yml')
    .map((filePath) => path.basename(filePath, '.yml'))
    .filter((slug) => {
      if (slug === '_template') return false;
      if (!SLUG_REGEX.test(slug)) {
        throw new Error(`Invalid spec filename: ${slug}.yml must be snake_case (lowercase with underscores)`);
      }
      return true;
    });
}

/**
 * List doc slugs from directory.
 */
function listDocSlugs(docsDir: string): string[] {
  const SLUG_REGEX = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
  
  return listFilesByExtension(docsDir, '.md')
    .map((filePath) => path.basename(filePath, '.md'))
    .filter((slug) => {
      if (slug === 'overview') return false;
      if (!SLUG_REGEX.test(slug)) {
        throw new Error(`Invalid doc filename: ${slug}.md must be snake_case (lowercase with underscores)`);
      }
      return true;
    });
}

/**
 * List proof slugs from directory.
 */
function listProofSlugs(proofsDir: string): string[] {
  return listFilesByExtension(proofsDir, '.json').map((filePath) =>
    path.basename(filePath, '.json'),
  );
}

/**
 * List render slugs from directory.
 */
function listRenderSlugs(renderDir: string): string[] {
  return listFilesByExtension(renderDir, '.json')
    .map((filePath) => path.basename(filePath))
    .filter((fileName) => fileName.endsWith(RENDER_PAYLOAD_SUFFIX))
    .map((fileName) => fileName.slice(0, fileName.length - RENDER_PAYLOAD_SUFFIX.length));
}

/**
 * Normalize status value.
 */
function normalizeStatus(rawStatus: unknown, allowedStatus: Set<string>): string {
  const normalized = String(rawStatus || '').trim().toLowerCase();
  if (!normalized) return 'missing';
  return allowedStatus.has(normalized) ? normalized : 'unknown';
}

/**
 * Extract H1 from markdown content.
 */
function extractMarkdownH1(content: string): string {
  const match = /^#\s+(.+?)\s*$/m.exec(String(content || ''));
  return match ? match[1].trim() : '';
}

/**
 * Read spec state from file.
 */
function readSpecState(specPath: string): ComponentSpecState {
  if (!fileExists(specPath)) {
    return {
      exists: false,
      status: 'missing',
      name: '',
      componentSetNodeId: null,
    };
  }

  const spec = parseYamlDocument(
    fs.readFileSync(specPath, 'utf8'),
    `component spec (${path.basename(specPath)})`,
  );
  const figma = isPlainObject(spec.figma) ? (spec.figma as Record<string, unknown>) : {};

  const normalizedNodeId = normalizeNodeId(String(figma.component_set_node_id || '').trim());
  const componentSetNodeId = isValidNodeId(normalizedNodeId)
    ? normalizedNodeId
    : null;

  const rawName = String(spec.name || '').trim();
  const name = rawName && !isTbdMarker(rawName) ? rawName : '';

  return {
    exists: true,
    status: normalizeStatus(spec.status, SPEC_STATUS),
    name,
    componentSetNodeId,
  };
}

/**
 * Read doc state from file.
 */
function readDocState(docPath: string): ComponentDocState {
  if (!fileExists(docPath)) {
    return {
      exists: false,
      status: 'missing',
      title: '',
      figmaFileUrl: null,
      componentSetNodeId: null,
    };
  }

  const rawMarkdown = fs.readFileSync(docPath, 'utf8');
  const { frontmatter, content } = parseMarkdownFrontmatter(rawMarkdown);
  const frontmatterObj = isPlainObject(frontmatter) ? frontmatter : {};
  const figma = isPlainObject(frontmatterObj.figma) ? (frontmatterObj.figma as Record<string, unknown>) : {};
  const status = normalizeStatus(frontmatterObj.doc_status, DOC_STATUS);

  const fileUrlRaw = String(figma.file_url || '').trim();
  const figmaFileUrl = isValidHttpUrl(fileUrlRaw) ? fileUrlRaw : null;

  const rawNodeId = normalizeNodeId(String(figma.component_set_node_id || '').trim());
  const componentSetNodeId = isValidNodeId(rawNodeId) ? rawNodeId : null;

  return {
    exists: true,
    status,
    title: extractMarkdownH1(content),
    figmaFileUrl,
    componentSetNodeId,
  };
}

/**
 * Read render state from file.
 */
function readRenderState(renderPath: string): ComponentRenderState {
  if (!fileExists(renderPath)) {
    return {
      exists: false,
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(renderPath, 'utf8'));
    if (!isPlainObject(parsed) && !Array.isArray(parsed)) {
      throw new Error('render payload must be an object or array.');
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid render payload JSON (${renderPath}): ${reason}`);
  }

  return {
    exists: true,
  };
}

/**
 * Normalize optional ISO date string.
 */
function normalizeOptionalIsoDate(rawValue: unknown): string | null {
  const value = String(rawValue || '').trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Normalize proof image path to project-relative path.
 */
function normalizeProofImagePath(rawPath: string): string | null {
  const value = String(rawPath || '').trim();
  if (!value) return null;

  const absolute = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(PROJECT_ROOT, value);

  if (!fileExists(absolute)) return null;
  try {
    return toProjectRelativePath(absolute);
  } catch {
    return null;
  }
}

/**
 * Check if visual proof has asset (URL or image path).
 */
function hasVisualProofAsset(visualProof: ComponentVisualProofState): boolean {
  return Boolean(visualProof.screenshotUrl || visualProof.imagePath);
}

/**
 * Normalize visual variant from raw object.
 */
function normalizeVisualVariant(rawVariant: unknown): VisualProofVariant | null {
  if (!isPlainObject(rawVariant)) return null;
  const variant = rawVariant as Record<string, unknown>;

  const nodeIdRaw = normalizeNodeId(String(variant.node_id || '').trim());
  const nodeId = isValidNodeId(nodeIdRaw) ? nodeIdRaw : null;
  const screenshotRaw = String(variant.screenshot_url || '').trim();
  const screenshotUrl = isValidHttpUrl(screenshotRaw) ? screenshotRaw : null;
  const imagePath = normalizeProofImagePath(String(variant.image_path || ''));
  const capturedAt = normalizeOptionalIsoDate(variant.captured_at);
  const name = String(variant.name || '').trim() || nodeId || 'Variant';

  return {
    name,
    node_id: nodeId,
    screenshot_url: screenshotUrl,
    image_path: imagePath,
    captured_at: capturedAt,
    image_sha256: String(variant.image_sha256 || '').trim() || null,
    image_bytes: Number.isFinite(Number(variant.image_bytes))
      ? Number(variant.image_bytes)
      : null,
    image_content_type:
      String(variant.image_content_type || '').trim() || null,
    image_width: Number.isFinite(Number(variant.image_width))
      ? Number(variant.image_width)
      : null,
    image_height: Number.isFinite(Number(variant.image_height))
      ? Number(variant.image_height)
      : null,
  };
}

/**
 * Read visual proof state from file.
 */
function readVisualProofState(proofPath: string): ComponentVisualProofState {
  if (!fileExists(proofPath)) {
    return {
      exists: false,
      screenshotUrl: null,
      imagePath: null,
      sourceUrl: null,
      nodeId: null,
      capturedAt: null,
      imageSha256: null,
      imageBytes: null,
      imageContentType: null,
      imageWidth: null,
      imageHeight: null,
      variants: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid visual proof JSON (${proofPath}): ${reason}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid visual proof JSON (${proofPath}): top-level object required.`);
  }

  const parsedObj = parsed as Record<string, unknown>;
  const screenshotRaw = String(
    parsedObj.screenshot_url || (parsedObj as any).image_url || (parsedObj as any).url || '',
  ).trim();
  const screenshotUrl = isValidHttpUrl(screenshotRaw) ? screenshotRaw : null;
  const imagePath = normalizeProofImagePath(
    String((parsedObj.image as Record<string, unknown>)?.path || parsedObj.image_path || ''),
  );

  const sourceRaw = String((parsedObj as any).source_url || '').trim();
  const sourceUrl = isValidHttpUrl(sourceRaw) ? sourceRaw : null;

  const rawNodeId = normalizeNodeId(String(parsedObj.node_id || '').trim());
  const nodeId = isValidNodeId(rawNodeId) ? rawNodeId : null;
  const variants = Array.isArray(parsedObj.variants)
    ? parsedObj.variants
        .map((variant) => normalizeVisualVariant(variant))
        .filter((v): v is VisualProofVariant => v !== null)
        .sort((a, b) =>
          `${a.name}|${a.node_id || ''}`.localeCompare(
            `${b.name}|${b.node_id || ''}`,
            'en',
            { sensitivity: 'base' },
          ),
        )
    : [];

  const image = parsedObj.image as Record<string, unknown> | undefined;

  return {
    exists: true,
    screenshotUrl,
    imagePath,
    sourceUrl,
    nodeId,
    capturedAt: normalizeOptionalIsoDate(parsedObj.captured_at),
    imageSha256: String(image?.sha256 || parsedObj.image_sha256 || '').trim() || null,
    imageBytes: Number.isFinite(Number(image?.bytes || parsedObj.image_bytes))
      ? Number(image?.bytes || parsedObj.image_bytes)
      : null,
    imageContentType:
      String(image?.content_type || parsedObj.image_content_type || '').trim() || null,
    imageWidth: Number.isFinite(Number(image?.width || parsedObj.image_width))
      ? Number(image?.width || parsedObj.image_width)
      : null,
    imageHeight: Number.isFinite(Number(image?.height || parsedObj.image_height))
      ? Number(image?.height || parsedObj.image_height)
      : null,
    variants,
  };
}

/**
 * Infer pipeline stage from component states.
 */
function inferPipelineStage(states: {
  spec: ComponentSpecState;
  doc: ComponentDocState;
  render: ComponentRenderState;
  visualProof: ComponentVisualProofState;
}): PipelineStage {
  const { spec, doc, render, visualProof } = states;
  if (visualProof.exists && hasVisualProofAsset(visualProof)) return 'visual-proof';
  if (render.exists) return 'render';
  if (doc.exists) return 'markdown';
  if (spec.exists) return 'spec';
  return 'missing-spec';
}

/**
 * Collect all unique slugs from source directories.
 */
function collectSlugs(dirs: {
  specsDir: string;
  docsDir: string;
  proofsDir: string;
  renderDir: string;
}): string[] {
  const slugs = new Set<string>();
  for (const slug of listSpecSlugs(dirs.specsDir)) slugs.add(slug);
  for (const slug of listDocSlugs(dirs.docsDir)) slugs.add(slug);
  for (const slug of listProofSlugs(dirs.proofsDir)) slugs.add(slug);
  for (const slug of listRenderSlugs(dirs.renderDir)) slugs.add(slug);

  return Array.from(slugs)
    .map((slug) => componentNameToSnakeCase(slug))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/**
 * Resolve display name from slug, spec name, or doc title.
 */
function resolveDisplayName(params: {
  slug: string;
  specName: string;
  docTitle: string;
}): string {
  const { slug, specName, docTitle } = params;
  if (docTitle) return docTitle;
  if (specName) return normalizeDisplayLabel(specName);
  return normalizeDisplayLabel(slug);
}

/**
 * Build single component registry entry.
 */
function buildComponentEntry(params: {
  slug: string;
  specsDir: string;
  docsDir: string;
  proofsDir: string;
  renderDir: string;
}): ComponentRegistryEntry {
  const { slug, specsDir, docsDir, proofsDir, renderDir } = params;
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
    spec.status === 'ready' &&
    doc.status === 'ready' &&
    hasVisualProofAsset(visualProof);

  const entry: Omit<ComponentRegistryEntry, 'fingerprint_sha256'> = {
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
      image_path: visualProof.imagePath,
      captured_at: visualProof.capturedAt,
      node_id: visualProof.nodeId,
      image_sha256: visualProof.imageSha256,
      image_bytes: visualProof.imageBytes,
      image_content_type: visualProof.imageContentType,
      image_width: visualProof.imageWidth,
      image_height: visualProof.imageHeight,
      variants_count: visualProof.variants.length,
      variants: visualProof.variants,
    },
    pipeline_stage: stage,
    ready_for_publish: readyForPublish,
  };

  return {
    ...entry,
    fingerprint_sha256: stableHash(entry),
  };
}

/**
 * Build summary from component entries.
 */
function buildSummary(components: ComponentRegistryEntry[]): ComponentRegistry['summary'] {
  const stageCounts: Record<PipelineStage, number> = {
    'missing-spec': 0,
    'spec': 0,
    'markdown': 0,
    'render': 0,
    'visual-proof': 0,
  };

  for (const component of components) {
    const stage = String(component.pipeline_stage || 'missing-spec');
    if (stage in stageCounts) {
      stageCounts[stage as PipelineStage] += 1;
    }
  }

  return {
    total_components: components.length,
    with_spec: components.filter((component) => component.spec.exists).length,
    with_doc: components.filter((component) => component.doc.exists).length,
    with_render_payload: components.filter((component) => component.render.exists)
      .length,
    with_visual_proof: components.filter(
      (component) =>
        component.visual_proof.exists &&
        (component.visual_proof.screenshot_url ||
          component.visual_proof.image_path),
    ).length,
    ready_for_publish: components.filter((component) => component.ready_for_publish)
      .length,
    by_pipeline_stage: stageCounts,
  };
}

/**
 * Build complete component registry.
 */
export function buildComponentRegistry(
  options: BuildRegistryOptions = {},
): ComponentRegistry {
  const {
    specsDir = DEFAULT_COMPONENT_SPECS_DIR,
    docsDir = DEFAULT_COMPONENT_DOCS_DIR,
    proofsDir = DEFAULT_VISUAL_PROOFS_DIR,
    renderDir = DEFAULT_RENDER_PAYLOADS_DIR,
  } = options;

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
      const bySlug = a.slug.localeCompare(b.slug, 'en', { sensitivity: 'base' });
      if (bySlug !== 0) return bySlug;
      return normalizeSortKey(a.display_name).localeCompare(
        normalizeSortKey(b.display_name),
        'en',
        { sensitivity: 'base' },
      );
    });

  const registryCore: Omit<ComponentRegistry, 'fingerprint_sha256'> = {
    schema_version: COMPONENT_REGISTRY_SCHEMA_VERSION,
    components,
    summary: buildSummary(components),
  };

  return {
    ...registryCore,
    fingerprint_sha256: stableHash(registryCore),
  };
}
