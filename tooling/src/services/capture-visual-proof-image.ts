/**
 * Capture Visual Proof Image
 *
 * Functions for capturing images from Figma (main + variants).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  LocalImageInfo,
  VisualProofVariant,
} from '../types/capture-visual-proof.js';
import { CaptureError } from './capture-visual-proof-error.js';
import { runAgentPrompt } from './agent-runner.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { normalizeNodeId } from '../utils/figma-node-id.js';
import { fetchFigmaImages, fetchFigmaNodes } from '../utils/figma-api.js';
import { logger } from '../utils/logger.js';
import {
  downloadBinary,
  normalizeImageExtension,
  extractImageDimensions,
  writeBufferAtomic,
  sha256Hex,
} from './capture-visual-proof-io.js';
import {
  extractVariantNodes,
  extractFirstJsonObject,
} from './capture-visual-proof-figma.js';
import { normalizeVariantSlug } from '../utils/parse-options.js';
import type { FigmaNode } from '../utils/figma.js';

/**
 * Context for main image capture.
 */
export interface MainCaptureContext {
  figmaUrl: string;
  nodeId: string;
  format: string;
  scale: number;
  figmaToken: string;
  figmaFileKey: string;
  agent: string;
  componentSlug: string;
  mainCaptureMode: 'auto' | 'agent' | 'rest';
  downloadTimeoutMs: number;
}

/**
 * Result of main image capture.
 */
export interface MainCaptureResult {
  imageUrlRaw: string;
  normalizedNodeId: string;
  nodeWidth: number | null;
  nodeHeight: number | null;
  captureSource: 'REST' | 'Agent';
}

function extractNodeDimensions(node: FigmaNode | null | undefined): { width: number | null; height: number | null } {
  if (!node) return { width: null, height: null };
  const width =
    Number.isFinite(Number(node.width)) ? Number(node.width) :
    Number.isFinite(Number(node.size?.width)) ? Number(node.size?.width) :
    Number.isFinite(Number(node.absoluteBoundingBox?.width)) ? Number(node.absoluteBoundingBox?.width) :
    null;
  const height =
    Number.isFinite(Number(node.height)) ? Number(node.height) :
    Number.isFinite(Number(node.size?.height)) ? Number(node.size?.height) :
    Number.isFinite(Number(node.absoluteBoundingBox?.height)) ? Number(node.absoluteBoundingBox?.height) :
    null;
  return { width, height };
}

interface MainCaptureRestDeps {
  fetchImages: typeof fetchFigmaImages;
  fetchNodes: typeof fetchFigmaNodes;
  warn: (message: string) => void;
}

const defaultMainCaptureRestDeps: MainCaptureRestDeps = {
  fetchImages: fetchFigmaImages,
  fetchNodes: fetchFigmaNodes,
  warn: (message: string) => logger.warn(message),
};

export async function captureMainImageViaRest(
  ctx: MainCaptureContext,
  deps: MainCaptureRestDeps = defaultMainCaptureRestDeps,
): Promise<MainCaptureResult> {
  if (!ctx.figmaToken || !ctx.figmaFileKey) {
    throw new CaptureError(
      'Main capture mode `rest` requires --figma-token (or FIGMA_TOKEN) and a resolvable Figma file key.',
      'REST_CAPTURE_MISSING_CREDENTIALS',
    );
  }

  try {
    const imagePayload = await deps.fetchImages({
      fileKey: ctx.figmaFileKey,
      nodeIds: [ctx.nodeId],
      token: ctx.figmaToken,
      format: ctx.format as 'png' | 'jpg' | 'svg' | 'pdf',
      scale: ctx.scale,
      timeoutMs: ctx.downloadTimeoutMs,
    }) as { images: Record<string, string> | null };

    let nodePayload: Awaited<ReturnType<typeof fetchFigmaNodes>> | null = null;
    try {
      nodePayload = await deps.fetchNodes({
        fileKey: ctx.figmaFileKey,
        nodeIds: [ctx.nodeId],
        token: ctx.figmaToken,
        depth: 0,
        timeoutMs: ctx.downloadTimeoutMs,
      });
    } catch (error) {
      deps.warn(
        `[capture-visual-proof-image] node metadata lookup failed for ${ctx.nodeId}; continuing without dimensions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const imageMap =
      imagePayload?.images ? (imagePayload.images as Record<string, string>) : {};
    const imageUrlRaw = String(imageMap[ctx.nodeId] || '').trim();
    const normalizedNodeId = ctx.nodeId;
    const nodeRecord = nodePayload?.nodes?.[ctx.nodeId]?.document || null;
    const dimensions = extractNodeDimensions(nodeRecord as FigmaNode | null);

    return {
      imageUrlRaw,
      normalizedNodeId,
      nodeWidth: dimensions.width,
      nodeHeight: dimensions.height,
      captureSource: 'REST',
    };
  } catch (error) {
    throw new CaptureError(
      `Main screenshot capture via REST failed: ${error instanceof Error ? error.message : String(error)}`,
      'REST_CAPTURE_FAILED',
    );
  }
}

/**
 * Build capture prompt for agent.
 */
export function buildCapturePrompt({
  figmaUrl,
  nodeId,
  format,
  scale,
}: {
  figmaUrl: string;
  nodeId: string;
  format: string;
  scale: number;
}): string {
  return [
    'Context',
    '- Capture a screenshot proof for a component node in Figma.',
    '',
    'Sources',
    figmaUrl ? `- Figma URL: ${figmaUrl}` : '',
    `- Target node id: ${nodeId}`,
    '',
    'Constraints',
    '- Use figma_take_screenshot with the provided node id.',
    `- Use format: ${format}.`,
    `- Use scale: ${scale}.`,
    '- Do not modify any Figma node.',
    '- Return JSON only. No markdown fences, no prose.',
    '',
    'Expected Output',
    '{ "image_url": "<https-url>", "node_id": "123:456", "format": "png", "scale": 2 }',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Capture main image via REST API or Agent.
 */
export async function captureMainImage(ctx: MainCaptureContext): Promise<MainCaptureResult> {
  const canUseRest = Boolean(ctx.figmaToken && ctx.figmaFileKey);
  const useRestForMainCapture =
    ctx.mainCaptureMode === 'rest' || (ctx.mainCaptureMode === 'auto' && canUseRest);

  let imageUrlRaw = '';
  let normalizedNodeId = ctx.nodeId;
  let nodeWidth: number | null = null;
  let nodeHeight: number | null = null;

  if (useRestForMainCapture) {
    const result = await captureMainImageViaRest(ctx);
    imageUrlRaw = result.imageUrlRaw;
    normalizedNodeId = result.normalizedNodeId;
    nodeWidth = result.nodeWidth;
    nodeHeight = result.nodeHeight;
  } else {
    const prompt = buildCapturePrompt({ figmaUrl: ctx.figmaUrl, nodeId: ctx.nodeId, format: ctx.format, scale: ctx.scale });
    let response;
    try {
      response = runAgentPrompt({
        prompt,
        agent: ctx.agent as 'codex' | 'claude' | 'gemini' | 'auto',
        label: `capture-visual-proof-${ctx.componentSlug || 'component'}`,
        passthrough: false,
      });
    } catch (error) {
      throw new CaptureError(
        error instanceof Error ? error.message : String(error),
        'AGENT_CAPTURE_FAILED',
      );
    }

    const payload = extractFirstJsonObject(response.stdout || '');
    if (!isPlainObject(payload)) {
      throw new CaptureError(
        'Unable to parse JSON screenshot payload from agent output. ' +
        'Run again with --agent codex and verify MCP connectivity.',
        'AGENT_OUTPUT_PARSE_FAILED',
      );
    }

    imageUrlRaw = String(
      (payload as Record<string, unknown>).image_url || (payload as Record<string, unknown>).url || (payload as Record<string, unknown>).imageUrl || '',
    ).trim();
    const nodeIdRaw = String((payload as Record<string, unknown>).node_id || (payload as Record<string, unknown>).nodeId || ctx.nodeId).trim();
    normalizedNodeId = normalizeNodeId(nodeIdRaw) || ctx.nodeId;
  }

  const captureSource = useRestForMainCapture ? 'REST' : 'Agent';

  if (!/^https?:\/\/\S+$/i.test(imageUrlRaw)) {
    throw new CaptureError(
      `${captureSource} output did not include a valid image URL. Received: ${imageUrlRaw || '<empty>'}`,
      'INVALID_IMAGE_URL',
    );
  }
  if (!normalizedNodeId || !/^\d+:\d+$/.test(normalizedNodeId)) {
    throw new CaptureError(
      `${captureSource} output did not include a valid node id. Received: <invalid-node-id>`,
      'INVALID_NODE_ID',
    );
  }

  return {
    imageUrlRaw,
    normalizedNodeId,
    nodeWidth,
    nodeHeight,
    captureSource,
  };
}

/**
 * Context for variant capture.
 */
export interface VariantCaptureContext {
  figmaToken: string;
  figmaFileKey: string;
  normalizedNodeId: string;
  format: string;
  scale: number;
  downloadTimeoutMs: number;
  variantLimit: number;
  componentSlug: string;
  proofImageDir: string;
  docsRootDir: string;
  storeLocalImage: boolean;
  requireLocalImage: boolean;
  dryRun: boolean;
}

/**
 * Capture variant images.
 */
export async function captureVariantImages(
  ctx: VariantCaptureContext,
  capturedAt: string,
): Promise<VisualProofVariant[]> {
  if (!ctx.figmaToken || !ctx.figmaFileKey) {
    return [];
  }

  const variantTree = await fetchFigmaNodes({
    fileKey: ctx.figmaFileKey,
    nodeIds: [ctx.normalizedNodeId],
    token: ctx.figmaToken,
    depth: 2,
    timeoutMs: ctx.downloadTimeoutMs,
  });

  if (!isPlainObject(variantTree)) {
    throw new CaptureError('Figma API response for variants is malformed.', 'VARIANT_API_MALFORMED');
  }

  const variantNodes = extractVariantNodes(
    variantTree as Record<string, unknown>,
    ctx.normalizedNodeId,
    normalizeNodeId,
    (nodeId: string) => /^\d+:\d+$/.test(nodeId),
  ).slice(0, ctx.variantLimit);

  if (variantNodes.length === 0) {
    return [];
  }

  const imagePayload = await fetchFigmaImages({
    fileKey: ctx.figmaFileKey,
    nodeIds: variantNodes.map((variant) => variant.nodeId),
    token: ctx.figmaToken,
    format: ctx.format as 'png' | 'jpg' | 'svg' | 'pdf',
    scale: ctx.scale,
    timeoutMs: ctx.downloadTimeoutMs,
  }) as { images: Record<string, string> | null };

  const imageMap =
    imagePayload?.images ? (imagePayload.images as Record<string, string>) : {};

  const variantProofs: VisualProofVariant[] = [];

  for (let index = 0; index < variantNodes.length; index += 1) {
    const variant = variantNodes[index];
    const screenshotUrl = String(imageMap[variant.nodeId] || '').trim();
    if (!/^https?:\/\/\S+$/i.test(screenshotUrl)) continue;

    const variantInfo: VisualProofVariant = {
      name: variant.name,
      node_id: variant.nodeId,
      screenshot_url: screenshotUrl,
      image_path: null,
      image_sha256: null,
      image_bytes: null,
      image_content_type: null,
      image_width: null,
      image_height: null,
      node_width: variant.width,
      node_height: variant.height,
      captured_at: capturedAt,
    };

    if (ctx.storeLocalImage) {
      try {
        const downloaded = await downloadBinary(
          screenshotUrl,
          ctx.downloadTimeoutMs,
        );
        const extension = normalizeImageExtension(
          ctx.format,
          downloaded.contentType,
          screenshotUrl,
        );
        const variantSlug = normalizeVariantSlug(variant.name) || `variant_${index + 1}`;
        const localVariantPath = path.join(
          ctx.proofImageDir,
          'variants',
          `${ctx.componentSlug || 'component'}__${String(index + 1).padStart(2, '0')}__${variantSlug}.${extension}`,
        );
        const dimensions = extractImageDimensions(
          downloaded.buffer,
          extension,
        );
        if (!ctx.dryRun) {
          writeBufferAtomic(localVariantPath, downloaded.buffer);
        }
        variantInfo.image_path = path
          .relative(ctx.docsRootDir, localVariantPath)
          .split(path.sep)
          .join('/');
        variantInfo.image_sha256 = sha256Hex(downloaded.buffer);
        variantInfo.image_bytes = downloaded.buffer.byteLength;
        variantInfo.image_content_type =
          downloaded.contentType || `image/${extension}`;
        variantInfo.image_width = dimensions.width;
        variantInfo.image_height = dimensions.height;
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : String(error);
        if (ctx.requireLocalImage) {
          throw new CaptureError(
            `Unable to persist local image for variant '${variant.name}': ${reason}`,
            'VARIANT_IMAGE_PERSIST_FAILED',
          );
        }
      }
    }

    variantProofs.push(variantInfo);
  }

  return variantProofs;
}

/**
 * Download and store main image locally.
 */
export async function downloadAndStoreMainImage(
  ctx: {
    proofImageDir: string;
    componentSlug: string;
    format: string;
    downloadTimeoutMs: number;
    dryRun: boolean;
    storeLocalImage: boolean;
    requireLocalImage: boolean;
  },
  mainResult: MainCaptureResult,
): Promise<LocalImageInfo> {
  const localImageInfo: LocalImageInfo = {
    path: null,
    sha256: null,
    bytes: null,
    contentType: null,
    width: null,
    height: null,
  };

  if (!ctx.storeLocalImage) {
    return localImageInfo;
  }

  try {
    const downloaded = await downloadBinary(mainResult.imageUrlRaw, ctx.downloadTimeoutMs);
    const extension = normalizeImageExtension(
      ctx.format,
      downloaded.contentType,
      mainResult.imageUrlRaw,
    );
    const localImagePath = path.join(
      ctx.proofImageDir,
      `${ctx.componentSlug || 'component'}.${extension}`,
    );
    const dimensions = extractImageDimensions(downloaded.buffer, extension);

    if (!ctx.dryRun) {
      writeBufferAtomic(localImagePath, downloaded.buffer);
    }

    localImageInfo.path = localImagePath;
    localImageInfo.sha256 = sha256Hex(downloaded.buffer);
    localImageInfo.bytes = downloaded.buffer.byteLength;
    localImageInfo.contentType =
      downloaded.contentType || `image/${extension}`;
    localImageInfo.width = dimensions.width;
    localImageInfo.height = dimensions.height;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (ctx.requireLocalImage) {
      throw new CaptureError(
        `Unable to persist local visual proof image: ${reason}`,
        'LOCAL_IMAGE_PERSIST_FAILED',
      );
    }
    logger.warn(
      `Warning: local visual proof image was not stored (${reason}).`,
    );
  }

  return localImageInfo;
}

/**
 * Load previous proof image paths from existing payload.
 * @param proofImagesSlugPath - Slug-based path hint (e.g. `<proofDir>/<slug>`), not a directory
 */
export async function loadPreviousProofImagePaths(
  proofImagesSlugPath: string,
  docsRootDir: string,
  dryRun: boolean,
): Promise<string[]> {
  if (dryRun) {
    return [];
  }

  // `proofImagesSlugPath` is a slug hint path (e.g. `<proofDir>/<slug>`), not a real directory.
  // Keep lookup rooted at the actual proof directory to match where images are written.
  const proofDir = path.dirname(path.resolve(proofImagesSlugPath));
  const proofImageDir = path.join(proofDir, 'images');
  const variantsDir = path.join(proofImageDir, 'variants');
  const slug = path.basename(proofImagesSlugPath).trim();
  if (!slug) return [];

  const paths: string[] = [];
  if (fs.existsSync(proofImageDir)) {
    for (const entry of fs.readdirSync(proofImageDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = String(entry.name || '');
      if (!name.startsWith(`${slug}.`)) continue;
      paths.push(path.join(proofImageDir, name));
    }
  }
  if (fs.existsSync(variantsDir)) {
    for (const entry of fs.readdirSync(variantsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = String(entry.name || '');
      if (!name.startsWith(`${slug}__`)) continue;
      paths.push(path.join(variantsDir, name));
    }
  }

  const resolvedDocsRoot = path.resolve(docsRootDir);
  return paths
    .map((candidate) => path.resolve(candidate))
    .filter((candidate) => {
      const rel = path.relative(resolvedDocsRoot, candidate);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    });
}
