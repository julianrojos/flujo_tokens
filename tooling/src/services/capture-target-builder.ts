/**
 * Capture Target Builder
 *
 * Builds capture targets from Figma source candidates.
 * Handles spec extraction, exhibit mapping, and atomic writes.
 */

import * as fs from 'node:fs/promises';
import * as yaml from 'js-yaml';
import * as path from 'node:path';

import { componentNameToDisplayName } from '../utils/component-name.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { resolveInferredSlug } from './capture-targets.js';
import { resolveDocsPaths } from './capture-path-resolver.js';
import type { CaptureTarget, CaptureTargetKind } from '../types/capture-targets.js';
import type { DocsPaths } from '../types/capture-path-resolver.js';
import type { ExtractedComponentSpec } from '../types/spec.js';

/**
 * Context for capture operations.
 */
export interface CaptureContext {
  specsDir?: string;
  docsDir?: string;
  generatedDir?: string;
  [key: string]: unknown;
}

/**
 * Figma descriptor for source.
 */
export interface FigmaDescriptor {
  fileKey: string;
  sourceUrl: string;
  [key: string]: unknown;
}

/**
 * Source candidate for capture.
 */
export interface SourceCandidate {
  node_id: string;
  name?: string;
  page_name?: string;
  kind?: string;
  [key: string]: unknown;
}

/**
 * Spec exhibit mapping.
 */
export interface SpecExhibit {
  nodeId: string | null;
  imageUrl: string | null;
}

/**
 * Spec exhibits collection.
 */
export interface SpecExhibits {
  specsNodeId: string | null;
  anatomy: SpecExhibit | null;
  properties: SpecExhibit | null;
  layout: SpecExhibit | null;
}

/**
 * Options for building capture targets.
 */
export interface BuildCaptureTargetsOptions {
  sourceCandidates: SourceCandidate[];
  descriptor: FigmaDescriptor;
  ctx: CaptureContext;
  docsRootOverride?: string;
  applySlugOverride?: boolean;
  componentSlugOverride?: string;
  slugByNodeFromRegistry?: Record<string, string>;
  slugByNodeFromSpecs?: Record<string, string>;
  requireExistingDoc?: boolean;
  injectDocSpecs?: boolean;
  includeSpecExhibits?: boolean;
  figmaToken: string;
  repoRoot: string;
  ensureFilePayload: () => Promise<unknown>;
  fetchFigmaNodes: (options: { fileKey: string; nodeIds: string[]; token: string }) => Promise<{
    nodes?: Record<string, { document?: unknown }>;
  }>;
  fetchFigmaImages: (options: { fileKey: string; nodeIds: string[]; token: string; format?: string; scale?: number }) => Promise<{
    images?: Record<string, string>;
  }>;
  extractComponentSpec: (node: unknown) => ExtractedComponentSpec;
  resolveSpecExhibitNodeIds: (options: { figmaFilePayload: unknown; targetNodeId: string }) => {
    specsNodeId?: string;
    anatomyNodeId?: string;
    propertiesNodeId?: string;
    layoutNodeId?: string;
  } | null;
  buildFigmaNodeUrl: (descriptor: FigmaDescriptor, nodeId: string) => string;
  classifyTargetKind: (kind?: string) => CaptureTargetKind;
  renderEnrichedMarkdownSeed: (options: { slug: string; displayName: string; nodeUrl: string; nodeId: string; spec?: unknown }) => string;
  injectSpecZones: (markdown: string, spec: unknown, slug: string) => string;
  writeTextAtomic: (filePath: string, content: string) => Promise<void>;
  stderrWrite?: (data: string) => void;
  markdownExistsFn: (filePath: string) => boolean;
  specExistsFn: (filePath: string) => boolean;
  readMarkdownContentFn: (filePath: string) => string;
}

/**
 * Skipped target result.
 */
export interface SkippedTarget {
  slug?: string;
  node_id: string;
  name: string;
  reason: string;
  markdown_path?: string;
  error?: string;
}

/**
 * Result of building capture targets.
 */
export interface BuildCaptureTargetsResult {
  targets: CaptureTarget[];
  skipped: SkippedTarget[];
}

/**
 * Build error message for node operations.
 */
function buildNodeErrorMessage(prefix: string, nodeId: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `[capture] ${prefix} for ${nodeId}: ${detail}\n`;
}

/**
 * Map spec exhibit from images by node ID.
 */
function mapSpecExhibit(sourceNodeId: string, imagesByNodeId: Record<string, string>): SpecExhibit | null {
  const normalizedNodeId = String(sourceNodeId || '').trim();
  if (!normalizedNodeId) return null;
  
  const imageUrl = String(imagesByNodeId[normalizedNodeId] || '').trim();
  return {
    nodeId: normalizedNodeId,
    imageUrl: imageUrl || null,
  };
}

/**
 * Write YAML and Markdown atomically using temp files.
 */
async function writeDualAtomic(
  ymlPath: string,
  ymlContent: string,
  mdPath: string,
  mdContent: string,
): Promise<void> {
  const crypto = await import('node:crypto');
  const uniqueId = crypto.randomBytes(4).toString('hex');
  const ts = Date.now();
  const pid = process.pid;
  const ymlTemp = `${ymlPath}.tmp.${pid}.${ts}.${uniqueId}`;
  const mdTemp = `${mdPath}.tmp.${pid}.${ts}.${uniqueId}`;
  
  try {
    await fs.writeFile(ymlTemp, ymlContent, 'utf8');
    await fs.writeFile(mdTemp, mdContent, 'utf8');
    await Promise.all([
      fs.rename(ymlTemp, ymlPath),
      fs.rename(mdTemp, mdPath),
    ]);
  } catch (error) {
    await Promise.all([
      fs.unlink(ymlTemp).catch(() => {}),
      fs.unlink(mdTemp).catch(() => {}),
    ]);
    throw error;
  }
}

/**
 * Build capture targets from source candidates.
 */
export async function buildCaptureTargets(
  options: BuildCaptureTargetsOptions,
): Promise<BuildCaptureTargetsResult> {
  const {
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
    writeTextAtomic,
    stderrWrite = process.stderr.write.bind(process.stderr),
    markdownExistsFn,
    specExistsFn,
    readMarkdownContentFn,
  } = options;

  const targets: CaptureTarget[] = [];
  const skipped: SkippedTarget[] = [];

  for (const candidate of sourceCandidates) {
    const nodeId = String(candidate.node_id || '').trim();
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
        name: String(candidate.name || '').trim() || nodeId,
        reason: 'slug-resolution-failed',
      });
      continue;
    }

    const resolvedPaths: DocsPaths = resolveDocsPaths({
      ctx,
      docsRootOverride,
      slug: inferredSlug,
    });
    
    const nodeUrl = buildFigmaNodeUrl(descriptor, nodeId) || descriptor.sourceUrl;
    const markdownExists = markdownExistsFn(resolvedPaths.markdownPath);
    let extractedNodeSpec: ExtractedComponentSpec | null = null;
    let specExhibits: SpecExhibits | null = null;
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
        stderrWrite(buildNodeErrorMessage('Node extraction failed', nodeId, error));
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
          const exhibitNodeIdsArray = [
            exhibitNodeIds.anatomyNodeId,
            exhibitNodeIds.propertiesNodeId,
            exhibitNodeIds.layoutNodeId,
          ].filter((id): id is string => Boolean(id));
          
          const uniqueNodeIds = Array.from(new Set(exhibitNodeIdsArray));
          let imagesByNodeId: Record<string, string> = {};
          
          if (uniqueNodeIds.length > 0) {
            const imagesPayload = await fetchFigmaImages({
              fileKey: descriptor.fileKey,
              nodeIds: uniqueNodeIds,
              token: figmaToken,
              format: 'png',
              scale: 2,
            });
            imagesByNodeId =
              imagesPayload?.images && typeof imagesPayload.images === 'object'
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
        stderrWrite(buildNodeErrorMessage('Specs exhibit extraction failed', nodeId, error));
      }
    }

    if (requireExistingDoc && !markdownExists) {
      skipped.push({
        slug: inferredSlug,
        node_id: nodeId,
        name: String(candidate.name || '').trim() || inferredSlug,
        reason: 'markdown-missing',
        markdown_path: path.relative(repoRoot, resolvedPaths.markdownPath),
      });
      continue;
    }

    let finalWritePayloads: { yml: string; md: string | null } | null = null;

    try {
      if (extractedNodeSpec) {
        let currentYml: Record<string, unknown> = {};
        try {
          if (specExistsFn(resolvedPaths.specPath)) {
            const content = await fs.readFile(resolvedPaths.specPath, 'utf8');
            const parsed = yaml.load(content) as unknown;
            if (!isPlainObject(parsed)) {
              // Spec file is corrupted or not an object - start fresh
              currentYml = { name: inferredSlug, figma: { component_set_node_id: nodeId } };
            } else {
              currentYml = parsed as Record<string, unknown>;
            }
          } else {
            currentYml = { name: inferredSlug, figma: { component_set_node_id: nodeId } };
          }
        } catch {
          // Assume empty/corrupt and overwrite safely
          currentYml = { name: inferredSlug, figma: { component_set_node_id: nodeId } };
        }

        currentYml.anatomy = extractedNodeSpec.anatomy;
        currentYml.properties = extractedNodeSpec.properties;
        currentYml.variants = extractedNodeSpec.variants;
        currentYml.layout = extractedNodeSpec.layout;

        const mergedYmlText = yaml.dump(currentYml, { lineWidth: -1 });

        let mdToWrite: string | null = null;
        if (markdownExists && injectDocSpecs) {
          const currentMarkdown = readMarkdownContentFn(resolvedPaths.markdownPath);
          const newMd = injectSpecZones(currentMarkdown, currentYml, inferredSlug);
          if (newMd !== currentMarkdown || !specExistsFn(resolvedPaths.specPath)) {
            mdToWrite = newMd;
          }
        } else if (!markdownExists && !requireExistingDoc) {
          const seed = renderEnrichedMarkdownSeed({
            slug: inferredSlug,
            displayName: componentNameToDisplayName(String(candidate.name || '').trim()) || inferredSlug,
            nodeUrl,
            nodeId,
            spec: currentYml,
          });
          mdToWrite = injectSpecZones(seed, currentYml, inferredSlug);
        }

        if (mdToWrite !== null || (!specExistsFn(resolvedPaths.specPath) && injectDocSpecs)) {
          finalWritePayloads = { 
            yml: mergedYmlText, 
            md: mdToWrite || readMarkdownContentFn(resolvedPaths.markdownPath),
          };
        }
      } else if (!markdownExists && !requireExistingDoc) {
        const seed = buildMarkdownSeed({
          slug: inferredSlug,
          candidateName: String(candidate.name || '').trim() || inferredSlug,
          nodeUrl,
          nodeId,
        });
        await writeTextAtomic(resolvedPaths.markdownPath, seed);
      }
    } catch (error) {
      skipped.push({
        slug: inferredSlug,
        node_id: nodeId,
        name: String(candidate.name || '').trim() || inferredSlug,
        reason: 'markdown-enrich-failed',
        markdown_path: resolvedPaths.markdownPath,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (finalWritePayloads) {
      try {
        await writeDualAtomic(
          resolvedPaths.specPath,
          finalWritePayloads.yml,
          resolvedPaths.markdownPath,
          finalWritePayloads.md,
        );
      } catch (error) {
        skipped.push({
          slug: inferredSlug,
          node_id: nodeId,
          name: String(candidate.name || '').trim() || inferredSlug,
          reason: 'atomic-write-failed',
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
      name: String(candidate.name || '').trim() || inferredSlug,
      kind: classifyTargetKind(candidate.kind),
      pageName: String(candidate.page_name || '').trim() || null,
      markdownPath: resolvedPaths.markdownPath,
      specPath: resolvedPaths.specPath,
      specExists,
      nodeUrl,
      specExhibits,
    });
  }

  return { targets, skipped };
}

/**
 * Build markdown seed for new component.
 */
function buildMarkdownSeed(params: {
  slug: string;
  candidateName: string;
  nodeUrl: string;
  nodeId: string;
}): string {
  const { slug, candidateName, nodeUrl, nodeId } = params;
  
  return `---
doc_type: component
doc_status: draft
figma:
  file_url: ${nodeUrl}
  last_verified: TBD
  node_id: ${nodeId}
component_name: ${slug}
---

# ${candidateName}

## Overview

- Purpose: TBD
- Figma component set: \`${candidateName}\`.
- Source: [${candidateName} in Figma](${nodeUrl}).

## Anatomy

TBD

## Component API

TBD

## Visual Specifications

TBD

## Usage Guidelines

### When to use

- TBD

### When not to use

- TBD

## Accessibility

- ARIA: TBD
- Keyboard: TBD
- Focus: TBD
- Hit area: TBD
- Contrast: TBD

## Gaps / TBD

- [ ] [CONTENT_UNKNOWN] Complete component documentation with product evidence.
`;
}
