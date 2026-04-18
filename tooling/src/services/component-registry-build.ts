/**
 * Component Registry Builder
 *
 * Builds component registry from spec, doc, and visual proof sources.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { componentNameToSnakeCase } from '../utils/component-name.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { normalizeNodeId } from '../utils/figma-node-id.js';
import { PROJECT_ROOT } from '../utils/system-context.js';
import { requireNonEmptyPathOption } from '../utils/path-guards.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { isTbdMarker } from '../utils/tbd.js';
import type {
  ComponentRegistry,
  ComponentRegistryEntry,
  ComponentSpecState,
  ComponentDocState,
  ComponentVisualProofState,
  PipelineStage,
  BuildRegistryOptions,
  SpecStatus,
} from '../types/component-registry.js';
import {
  COMPONENT_REGISTRY_SCHEMA_VERSION,
  PIPELINE_STAGE_ORDER,
} from './component-registry-constants.js';
import {
  fileExists,
  isValidNodeId,
  normalizeDisplayLabel,
  normalizeSortKey,
  stableHash,
  toProjectRelativePath,
} from './component-registry-utils.js';

const SPEC_STATUS = new Set(['draft', 'ready']);

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
        throw new Error(`Invalid component spec filename: ${slug}.yml must be snake_case (lowercase with underscores)`);
      }
      return true;
    });
}

/**
 * Collect node IDs that correspond to variant components within component sets.
 */
function collectVariantComponentNodeIds(specsDir: string): Set<string> {
  const nodeIds = new Set<string>();
  const specSlugs = listSpecSlugs(specsDir);

  for (const slug of specSlugs) {
    const specPath = path.join(specsDir, `${slug}.yml`);
    if (!fileExists(specPath)) continue;

    let spec: Record<string, unknown>;
    try {
      spec = parseYamlDocument(
        fs.readFileSync(specPath, 'utf8'),
        `component spec (${path.basename(specPath)})`,
      ) as unknown as Record<string, unknown>;
    } catch {
      continue;
    }

    const properties = Array.isArray(spec.properties) ? spec.properties : [];
    const hasVariantAxis = properties.some((property) => {
      if (!isPlainObject(property)) return false;
      const type = String((property as Record<string, unknown>).type || '')
        .trim()
        .toUpperCase();
      return type === 'VARIANT';
    });
    if (!hasVariantAxis) continue;

    const anatomy = Array.isArray(spec.anatomy) ? spec.anatomy : [];
    for (const node of anatomy) {
      if (!isPlainObject(node)) continue;
      const nodeObj = node as Record<string, unknown>;
      const nodeType = String(nodeObj.type || '').trim().toUpperCase();
      if (nodeType !== 'COMPONENT') continue;
      const normalized = normalizeNodeId(String(nodeObj.id || '').trim());
      if (!isValidNodeId(normalized)) continue;
      nodeIds.add(normalized);
    }
  }

  return nodeIds;
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

const PROOF_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * List proof slugs from image assets directory.
 */
function listProofSlugs(proofsDir: string): string[] {
  if (!fs.existsSync(proofsDir)) return [];
  return fs
    .readdirSync(proofsDir, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isFile()) return false;
      const ext = path.extname(entry.name).toLowerCase();
      return PROOF_IMAGE_EXTENSIONS.includes(ext);
    })
    .map((entry) => path.basename(entry.name, path.extname(entry.name)))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
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
  ) as unknown as Record<string, unknown>;
  const figma = isPlainObject(spec.figma) ? (spec.figma as Record<string, unknown>) : {};

  const normalizedNodeId = normalizeNodeId(String(figma.component_set_node_id || '').trim());
  const componentSetNodeId = isValidNodeId(normalizedNodeId)
    ? normalizedNodeId
    : null;

  const rawName = String(spec.name || '').trim();
  const name = rawName && !isTbdMarker(rawName) ? rawName : '';

  return {
    exists: true,
    status: normalizeStatus(spec.status, SPEC_STATUS) as SpecStatus,
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
  return {
    exists: true,
    status: 'draft',
    title: extractMarkdownH1(rawMarkdown),
    figmaFileUrl: null,
    componentSetNodeId: null,
  };
}

/**
 * Normalize proof image path to project-relative path.
 */
function normalizeProofImagePath(
  rawPath: string,
  options: { relativeBaseDirs?: string[] } = {},
): string | null {
  const value = String(rawPath || '').trim();
  if (!value) return null;

  const candidates: string[] = [];
  if (path.isAbsolute(value)) {
    candidates.push(path.resolve(value));
  } else {
    const baseDirs = Array.isArray(options.relativeBaseDirs)
      ? options.relativeBaseDirs
      : [];
    for (const baseDir of baseDirs) {
      const resolvedBase = String(baseDir || '').trim();
      if (!resolvedBase) continue;
      candidates.push(path.resolve(resolvedBase, value));
    }
    candidates.push(path.resolve(PROJECT_ROOT, value));
  }

  const visited = new Set<string>();
  for (const candidate of candidates) {
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (!fileExists(candidate)) continue;
    try {
      return toProjectRelativePath(candidate);
    } catch {
      // Keep searching: candidate may exist but be outside project root.
      continue;
    }
  }
  return null;
}

/**
 * Check if visual proof has asset (URL or image path).
 */
function hasVisualProofAsset(visualProof: ComponentVisualProofState): boolean {
  return Boolean(visualProof.screenshotUrl || visualProof.imagePath);
}

function resolveProofImagePath(slug: string, proofsDir: string): string | null {
  for (const ext of PROOF_IMAGE_EXTENSIONS) {
    const candidate = path.join(proofsDir, `${slug}${ext}`);
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

/**
 * Read visual proof state from image asset.
 */
function readVisualProofState(proofImagePath: string | null): ComponentVisualProofState {
  if (!proofImagePath || !fileExists(proofImagePath)) {
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

  const imagePath = normalizeProofImagePath(proofImagePath);
  const stats = fs.statSync(proofImagePath);
  const contentType =
    path.extname(proofImagePath).toLowerCase() === '.png'
      ? 'image/png'
      : path.extname(proofImagePath).toLowerCase() === '.webp'
        ? 'image/webp'
        : 'image/jpeg';

  return {
    exists: true,
    screenshotUrl: null,
    imagePath,
    sourceUrl: null,
    nodeId: null,
    capturedAt: new Date(stats.mtimeMs).toISOString(),
    imageSha256: null,
    imageBytes: Number.isFinite(Number(stats.size)) ? Number(stats.size) : null,
    imageContentType: contentType,
    imageWidth: null,
    imageHeight: null,
    variants: [],
  };
}

/**
 * Infer pipeline stage from component states.
 */
function inferPipelineStage(states: {
  spec: ComponentSpecState;
  doc: ComponentDocState;
  visualProof: ComponentVisualProofState;
}): PipelineStage {
  const { spec, doc, visualProof } = states;
  if (visualProof.exists && hasVisualProofAsset(visualProof)) return 'visual-proof';
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
  includeVisualProofFiles: boolean;
}): string[] {
  const slugs = new Set<string>();
  for (const slug of listSpecSlugs(dirs.specsDir)) slugs.add(slug);
  for (const slug of listDocSlugs(dirs.docsDir)) slugs.add(slug);
  if (dirs.includeVisualProofFiles) {
    for (const slug of listProofSlugs(dirs.proofsDir)) slugs.add(slug);
  }

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
  includeVisualProofFiles: boolean;
}): ComponentRegistryEntry {
  const { slug, specsDir, docsDir, proofsDir, includeVisualProofFiles } = params;
  const specPath = path.join(specsDir, `${slug}.yml`);
  const docPath = path.join(docsDir, `${slug}.md`);
  const proofImagePath = resolveProofImagePath(slug, proofsDir);
  const defaultProofPath = path.join(proofsDir, `${slug}.png`);

  const spec = readSpecState(specPath);
  const doc = readDocState(docPath);
  const visualProof = includeVisualProofFiles
    ? readVisualProofState(proofImagePath)
    : {
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

  const componentSetNodeId =
    spec.componentSetNodeId ||
    doc.componentSetNodeId ||
    visualProof.nodeId ||
    null;

  const figmaUrl = doc.figmaFileUrl || visualProof.sourceUrl || null;
  const stage = inferPipelineStage({ spec, doc, visualProof });
  const readyForPublish =
    spec.status === 'ready' &&
    doc.exists &&
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
      visual_proof: toProjectRelativePath(proofImagePath || defaultProofPath),
    },
    spec: {
      exists: spec.exists,
      status: spec.status,
      name: spec.name || '',
      componentSetNodeId: spec.componentSetNodeId || null,
    },
    doc: {
      exists: doc.exists,
      status: doc.status,
      title: doc.title || '',
      figmaFileUrl: doc.figmaFileUrl || null,
      componentSetNodeId: doc.componentSetNodeId || null,
    },
    figma: {
      file_url: figmaUrl,
      component_set_node_id: componentSetNodeId,
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
    specsDir,
    docsDir,
    proofsDir,
    includeVisualProofFiles = false,
  } = options;
  const resolvedSpecsDir = path.resolve(requireNonEmptyPathOption(specsDir, 'specsDir'));
  const resolvedDocsDir = path.resolve(requireNonEmptyPathOption(docsDir, 'docsDir'));
  const resolvedProofsDir = path.resolve(
    String(proofsDir || path.join(path.dirname(resolvedDocsDir), '_generated', 'visual-proofs')),
  );

  const slugs = collectSlugs({
    specsDir: resolvedSpecsDir,
    docsDir: resolvedDocsDir,
    proofsDir: resolvedProofsDir,
    includeVisualProofFiles,
  });

  const components = slugs
    .map((slug) =>
      buildComponentEntry({
        slug,
        specsDir: resolvedSpecsDir,
        docsDir: resolvedDocsDir,
        proofsDir: resolvedProofsDir,
        includeVisualProofFiles,
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

  const variantComponentNodeIds = collectVariantComponentNodeIds(
    resolvedSpecsDir,
  );
  const canonicalComponents = components.filter((component) => {
    const nodeId = normalizeNodeId(
      String(component.figma.component_set_node_id || '').trim(),
    );
    if (!isValidNodeId(nodeId)) return true;
    return !variantComponentNodeIds.has(nodeId);
  });

  const registryCore: Omit<ComponentRegistry, 'fingerprint_sha256'> = {
    schema_version: COMPONENT_REGISTRY_SCHEMA_VERSION,
    components: canonicalComponents,
    summary: buildSummary(canonicalComponents),
  };

  return {
    ...registryCore,
    fingerprint_sha256: stableHash(registryCore),
  };
}
