/**
 * Capture visual proof services
 *
 * Utility functions for visual proof capture from Figma.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  LocalImageInfo,
  DownloadedBinary,
  ImageDimensions,
  SplitFrontmatterResult,
  VariantNode,
  VisualProofVariant,
  VisualProofPayload,
  CaptureVisualProofReport,
} from '../types/capture-visual-proof.js';
import { CaptureError } from './capture-visual-proof-error.js';
import { runAgentPrompt } from './agent-runner.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { normalizeNodeId } from '../utils/figma-node-id.js';
import { fetchFigmaImages, fetchFigmaNodes } from '../utils/figma-api.js';
import { logger } from '../utils/logger.js';
import { syncDocumentationIndices } from './component-registry-index.js';

/**
 * Write buffer to file atomically using temp file + rename.
 */
export function writeBufferAtomic(filePath: string, data: Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const tempPath = `${filePath}.${process.pid}.${randomSuffix}.tmp`;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, filePath);
}

/**
 * Write text to file atomically using temp file + rename.
 */
export function writeTextAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const tempPath = `${filePath}.${process.pid}.${randomSuffix}.tmp`;
  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Compute SHA256 hex hash of a buffer.
 */
export function sha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Map content type to file extension.
 */
export function contentTypeToExtension(contentType: string): string {
  const value = String(contentType || '').trim().toLowerCase();
  if (value.includes('image/png')) return 'png';
  if (value.includes('image/jpeg')) return 'jpg';
  if (value.includes('image/webp')) return 'webp';
  if (value.includes('image/svg+xml')) return 'svg';
  if (value.includes('application/pdf')) return 'pdf';
  return '';
}

/**
 * Normalize image extension from format, content type, or URL.
 */
export function normalizeImageExtension(
  format: string,
  contentType: string,
  imageUrl: string,
): string {
  const byContentType = contentTypeToExtension(contentType);
  if (byContentType) return byContentType;

  const byFormat = String(format || '').trim().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf'].includes(byFormat)) {
    return byFormat === 'jpeg' ? 'jpg' : byFormat;
  }

  let pathname = '';
  try {
    pathname = new URL(String(imageUrl || '')).pathname;
  } catch {
    pathname = '';
  }
  const ext = path.extname(pathname).replace(/^\./, '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }

  return 'png';
}

/**
 * Extract image dimensions from PNG or JPEG buffer.
 */
export function extractImageDimensions(
  buffer: Buffer,
  extension: string,
): ImageDimensions {
  const ext = String(extension || '').toLowerCase();

  if (ext === 'png' && buffer.length >= 24) {
    const signature = buffer.subarray(0, 8);
    const expected = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (signature.equals(expected)) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
    }
    return { width: null, height: null };
  }

  if ((ext === 'jpg' || ext === 'jpeg') && buffer.length >= 4) {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
      return { width: null, height: null };
    }

    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;

      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSof && offset + 8 < buffer.length) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) return { width, height };
        break;
      }

      offset += 2 + segmentLength;
    }
  }

  return { width: null, height: null };
}

/**
 * Download binary content from URL with timeout.
 */
export async function downloadBinary(
  url: string,
  timeoutMs: number,
): Promise<DownloadedBinary> {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable. Use Node.js 18+.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: '*/*' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: String(response.headers.get('content-type') || '').trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (String(message).toLowerCase().includes('abort')) {
      throw new Error(`Download timed out after ${timeoutMs}ms.`);
    }
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Split markdown frontmatter from content.
 */
export function splitFrontmatter(rawMarkdown: string): SplitFrontmatterResult {
  const source = String(rawMarkdown || '').replace(/\r\n/g, '\n');
  if (!source.startsWith('---\n')) {
    return { frontmatterRaw: '', content: source };
  }
  const lines = source.split('\n');
  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    return { frontmatterRaw: '', content: source };
  }
  const frontmatterRaw = `${lines.slice(0, endIndex + 1).join('\n')}\n`;
  const content = lines.slice(endIndex + 1).join('\n').replace(/^\n/, '');
  return { frontmatterRaw, content };
}

/**
 * Parse Figma file key from URL.
 */
export function parseFigmaFileKeyFromUrl(figmaUrl: string): string {
  const raw = String(figmaUrl || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const markerIndex = parts.findIndex(
      (part) =>
        part.toLowerCase() === 'design' || part.toLowerCase() === 'file',
    );
    if (markerIndex === -1) return '';
    return String(parts[markerIndex + 1] || '').trim();
  } catch {
    return '';
  }
}

/**
 * Resolve proof image absolute path within docs root.
 */
export function resolveProofImageAbsolutePath({
  docsRootDir,
  imagePath,
}: {
  docsRootDir: string;
  imagePath: string;
}): string {
  const raw = String(imagePath || '').trim();
  if (!raw) return '';
  const absolute = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(docsRootDir, raw);
  const rootWithSep = docsRootDir.endsWith(path.sep)
    ? docsRootDir
    : `${docsRootDir}${path.sep}`;
  if (absolute !== docsRootDir && !absolute.startsWith(rootWithSep)) return '';
  return absolute;
}

/**
 * Collect all proof image paths from payload (main + variants).
 */
export function collectProofImagePaths({
  proofPayload,
  docsRootDir,
}: {
  proofPayload: Record<string, unknown>;
  docsRootDir: string;
}): string[] {
  if (!proofPayload || typeof proofPayload !== 'object') return [];
  const paths: string[] = [];
  const imageObj = (proofPayload.image as Record<string, unknown> | undefined) || {};
  const topImagePath = String(
    (imageObj.path as string | undefined) ||
      (proofPayload.image_path as string | undefined) ||
      '',
  ).trim();
  if (topImagePath) paths.push(topImagePath);
  const variants = Array.isArray(proofPayload.variants)
    ? (proofPayload.variants as Record<string, unknown>[])
    : [];
  for (const variant of variants) {
    if (!variant || typeof variant !== 'object') continue;
    const variantPath = String((variant as Record<string, unknown>).image_path || '').trim();
    if (variantPath) paths.push(variantPath);
  }
  return paths
    .map((item) =>
      resolveProofImageAbsolutePath({
        docsRootDir,
        imagePath: item,
      }),
    )
    .filter(Boolean);
}

/**
 * Remove empty parent directories up to stop directory.
 */
export function removeEmptyParentDirs(startDir: string, stopDir: string): void {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);
  while (current.startsWith(stop)) {
    if (current === stop) break;
    try {
      const entries = fs.readdirSync(current);
      if (entries.length > 0) break;
      fs.rmdirSync(current);
      current = path.dirname(current);
    } catch {
      break;
    }
  }
}

/**
 * Load Figma config from spec file.
 */
export function loadSpecFigma(specPath: string, parseYamlDocumentFn: (content: string, label: string) => Record<string, unknown>): Record<string, unknown> {
  if (!fs.existsSync(specPath)) return {};
  const spec = parseYamlDocumentFn(
    fs.readFileSync(specPath, 'utf8'),
    `spec YAML (${path.basename(specPath)})`,
  );
  const figma = (spec as Record<string, unknown>).figma;
  return figma && typeof figma === 'object' && !Array.isArray(figma)
    ? (figma as Record<string, unknown>)
    : {};
}

/**
 * Resolve Figma file key from URL or spec.
 */
export function resolveFigmaFileKey({
  figmaUrl,
  specFigma,
}: {
  figmaUrl: string;
  specFigma: Record<string, unknown>;
}): string {
  const fromUrl = parseFigmaFileKeyFromUrl(figmaUrl);
  if (fromUrl) return fromUrl;
  const fromSpec = String(specFigma?.file || '').trim();
  if (fromSpec && fromSpec.toUpperCase() !== 'TBD') return fromSpec;
  return '';
}

/**
 * Extract variant nodes from Figma node payload.
 */
export function extractVariantNodes(
  nodePayload: Record<string, unknown> | null,
  rootNodeId: string,
  normalizeNodeIdFn: (nodeId: string) => string,
  isValidNodeIdFn: (nodeId: string) => boolean,
): VariantNode[] {
  const nodes =
    nodePayload && typeof nodePayload === 'object'
      ? (nodePayload.nodes as Record<string, unknown> | undefined)
      : null;
  const root =
    nodes && nodes[rootNodeId] && (nodes[rootNodeId] as Record<string, unknown>).document
      ? ((nodes[rootNodeId] as Record<string, unknown>).document as Record<string, unknown>)
      : null;
  if (!root || typeof root !== 'object') return [];

  const rootType = String(root.type || '').toUpperCase();
  const variants: VariantNode[] = [];

  if (rootType === 'COMPONENT_SET' && Array.isArray(root.children)) {
    for (const child of root.children) {
      if (!child || typeof child !== 'object') continue;
      if (String(child.type || '').toUpperCase() !== 'COMPONENT') continue;
      const childId = normalizeNodeIdFn(String(child.id || '').trim());
      if (!childId || !isValidNodeIdFn(childId)) continue;
      variants.push({
        nodeId: childId,
        name: String(child.name || childId).trim() || childId,
      });
    }
  } else if (rootType === 'COMPONENT') {
    const rootId =
      normalizeNodeIdFn(String(root.id || rootNodeId).trim()) || rootNodeId;
    if (rootId && isValidNodeIdFn(rootId)) {
      variants.push({
        nodeId: rootId,
        name: String(root.name || rootId).trim() || rootId,
      });
    }
  }

  return variants.sort((a, b) =>
    `${a.name}|${a.nodeId}`.localeCompare(`${b.name}|${b.nodeId}`, 'en', {
      sensitivity: 'base',
    }),
  );
}

/**
 * Extract first JSON object from text (handles fenced code blocks).
 */
export function extractFirstJsonObject(rawText: string): Record<string, unknown> | null {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const tryParse = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct && typeof direct === 'object') return direct;

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    const parsed = tryParse(fencedMatch[1].trim());
    if (parsed && typeof parsed === 'object') return parsed;
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        const parsed = tryParse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
        start = -1;
      }
    }
  }

  return null;
}

/**
 * Upsert visual proof section in markdown overview.
 */
export function upsertVisualProofInOverview(
  content: string,
  visualSectionLines: string[],
): string {
  const source = String(content || '');
  const overviewMatch = /^##\s+Overview\s*$/m.exec(source);
  if (!overviewMatch) {
    throw new Error(
      'Missing `## Overview` section. Visual proof must be nested inside Overview as `### Visual Proof`.',
    );
  }

  const overviewStart = overviewMatch.index;
  const overviewHeadingEnd = source.indexOf('\n', overviewStart);
  const overviewContentStart =
    overviewHeadingEnd === -1 ? source.length : overviewHeadingEnd + 1;
  const afterOverview = source.slice(overviewContentStart);
  const nextH2Match = /^##\s+/m.exec(afterOverview);
  const overviewEnd = nextH2Match
    ? overviewContentStart + nextH2Match.index
    : source.length;

  const beforeOverview = source.slice(0, overviewContentStart);
  const overviewBody = source.slice(overviewContentStart, overviewEnd);
  const afterSection = source.slice(overviewEnd);

  const lines = overviewBody.replace(/\n+$/, '').split('\n');
  const visualHeadingIndex = lines.findIndex((line) =>
    /^###\s+Visual Proof\s*$/.test(line.trim()),
  );

  if (visualHeadingIndex === -1) {
    const nextLines = [...lines];
    if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== '') {
      nextLines.push('');
    }
    nextLines.push(...visualSectionLines);
    return `${beforeOverview}${nextLines.join('\n')}\n${afterSection.replace(/^\n*/, '\n')}`;
  }

  let endIndex = lines.length;
  for (let i = visualHeadingIndex + 1; i < lines.length; i += 1) {
    if (/^###\s+/.test(lines[i].trim())) {
      endIndex = i;
      break;
    }
  }
  const nextLines = [
    ...lines.slice(0, visualHeadingIndex),
    ...visualSectionLines,
    ...lines.slice(endIndex),
  ];
  return `${beforeOverview}${nextLines.join('\n')}\n${afterSection.replace(/^\n*/, '\n')}`;
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
 * Parse boolean option with validation.
 */
export function parseBooleanOption(
  rawValue: string | undefined,
  optionName: string,
  fallback = false,
): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

/**
 * Parse positive integer with validation.
 */
export function parsePositiveInteger(
  rawValue: string | undefined,
  optionName: string,
  fallback: number,
): number {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a positive number.`,
    );
  }
  return Math.floor(parsed);
}

/**
 * Parse main capture mode with validation.
 */
export function parseMainCaptureMode(rawValue: string): 'auto' | 'agent' | 'rest' {
  const normalized = String(rawValue || 'auto').trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'agent' || normalized === 'rest') {
    return normalized as 'auto' | 'agent' | 'rest';
  }
  throw new Error(
    `Invalid --main-capture-mode value: ${rawValue}. Allowed: auto, agent, rest.`,
  );
}

/**
 * Normalize variant slug.
 */
export function normalizeVariantSlug(rawValue: string): string {
  return String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

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
  captureSource: 'REST' | 'Agent';
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

  if (useRestForMainCapture) {
    if (!ctx.figmaToken || !ctx.figmaFileKey) {
      throw new CaptureError(
        'Main capture mode `rest` requires --figma-token (or FIGMA_TOKEN) and a resolvable Figma file key.',
        'REST_CAPTURE_MISSING_CREDENTIALS',
      );
    }
    try {
      const imagePayload = await fetchFigmaImages({
        fileKey: ctx.figmaFileKey,
        nodeIds: [ctx.nodeId],
        token: ctx.figmaToken,
        format: ctx.format as 'png' | 'jpg' | 'svg' | 'pdf',
        scale: ctx.scale,
        timeoutMs: ctx.downloadTimeoutMs,
      }) as { images: Record<string, string> | null };
      const imageMap =
        imagePayload?.images ? (imagePayload.images as Record<string, string>) : {};
      imageUrlRaw = String(imageMap[ctx.nodeId] || '').trim();
      normalizedNodeId = ctx.nodeId;
    } catch (error) {
      throw new CaptureError(
        `Main screenshot capture via REST failed: ${error instanceof Error ? error.message : String(error)}`,
        'REST_CAPTURE_FAILED',
      );
    }
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
 */
export async function loadPreviousProofImagePaths(
  proofFilePath: string,
  docsRootDir: string,
  dryRun: boolean,
): Promise<string[]> {
  if (dryRun) {
    return [];
  }

  if (!fs.existsSync(proofFilePath)) {
    return [];
  }

  try {
    const previousPayload = JSON.parse(fs.readFileSync(proofFilePath, 'utf8'));
    return collectProofImagePaths({
      proofPayload: previousPayload,
      docsRootDir,
    });
  } catch {
    return [];
  }
}

/**
 * Write proof artifacts and cleanup stale images.
 */
export async function writeProofArtifacts(
  ctx: {
    proofDir: string;
    proofImageDir: string;
    docsRootDir: string;
    componentDocsDir: string;
    specPath: string;
    skipIndexSync: boolean;
    dryRun: boolean;
  },
  proofFilePath: string,
  proofPayload: VisualProofPayload,
  markdownPath: string,
  frontmatterRaw: string,
  nextContent: string,
  localImageInfo: LocalImageInfo,
  variantProofs: VisualProofVariant[],
  previousProofImagePaths: string[],
): Promise<string[]> {
  const deletedStaleImages: string[] = [];

  if (ctx.dryRun) {
    return deletedStaleImages;
  }

  fs.mkdirSync(ctx.proofDir, { recursive: true });
  writeTextAtomic(
    proofFilePath,
    `${JSON.stringify(proofPayload, null, 2)}\n`,
  );
  const markdownPrefix = frontmatterRaw
    ? `${frontmatterRaw}\n`
    : '';
  writeTextAtomic(
    markdownPath,
    `${markdownPrefix}${nextContent.replace(/^\n+/, '')}`,
  );

  const keepPaths = new Set<string>();
  if (localImageInfo.path) keepPaths.add(path.resolve(localImageInfo.path));
  for (const variant of variantProofs) {
    const absoluteVariantPath = resolveProofImageAbsolutePath({
      docsRootDir: ctx.docsRootDir,
      imagePath: variant.image_path || '',
    });
    if (absoluteVariantPath) keepPaths.add(absoluteVariantPath);
  }
  for (const oldPath of previousProofImagePaths) {
    const absoluteOldPath = path.resolve(oldPath);
    if (keepPaths.has(absoluteOldPath)) continue;
    if (!fs.existsSync(absoluteOldPath)) continue;
    try {
      fs.unlinkSync(absoluteOldPath);
      deletedStaleImages.push(
        path.relative(ctx.docsRootDir, absoluteOldPath).split(path.sep).join('/'),
      );
      removeEmptyParentDirs(path.dirname(absoluteOldPath), ctx.proofImageDir);
    } catch {
      // Best-effort cleanup; do not fail capture flow for stale artifacts.
    }
  }

  if (!ctx.skipIndexSync) {
    syncDocumentationIndices({
      docsDir: ctx.componentDocsDir,
      overviewPath: path.join(ctx.componentDocsDir, 'overview.md'),
      specsDir: path.dirname(ctx.specPath),
      proofsDir: ctx.proofDir,
      renderDir: path.join(ctx.docsRootDir, '_generated', 'figma_doc_models'),
      registryPath: path.join(ctx.docsRootDir, '_generated', 'component-registry.json'),
    });
  }

  return deletedStaleImages;
}

/**
 * Build capture report.
 */
export function buildCaptureReport(
  ctx: {
    dryRun: boolean;
    componentSlug: string;
    markdownPath: string;
    specPath: string;
    skipIndexSync: boolean;
    format: string;
    scale: number;
  },
  mainResult: MainCaptureResult,
  localImageInfo: LocalImageInfo,
  variantProofs: VisualProofVariant[],
  proofFilePath: string,
  deletedStaleImages: string[],
): CaptureVisualProofReport {
  return {
    ok: true,
    dryRun: ctx.dryRun,
    component: ctx.componentSlug,
    markdownPath: ctx.markdownPath,
    specPath: ctx.specPath,
    proofFilePath,
    localImagePath: localImageInfo.path,
    screenshotUrl: mainResult.imageUrlRaw,
    nodeId: mainResult.normalizedNodeId,
    format: ctx.format,
    scale: ctx.scale,
    imageSha256: localImageInfo.sha256,
    variantsCount: variantProofs.length,
    mainCaptureMode: mainResult.captureSource === 'REST' ? 'rest' : 'agent',
    indexSyncSkipped: ctx.skipIndexSync,
    deletedStaleImages,
  };
}

/**
 * Build visual proof payload.
 */
export function buildProofPayload({
  componentSlug,
  markdownPath,
  specPath,
  figmaUrl,
  mainResult,
  localImageInfo,
  variantProofs,
  capturedAt,
  format,
  scale,
  docsRootDir,
}: {
  componentSlug: string;
  markdownPath: string;
  specPath: string;
  figmaUrl: string;
  mainResult: MainCaptureResult;
  localImageInfo: LocalImageInfo;
  variantProofs: VisualProofVariant[];
  capturedAt: string;
  format: string;
  scale: number;
  docsRootDir: string;
}): VisualProofPayload {
  const localImagePathForJson = localImageInfo.path
    ? path.relative(docsRootDir, localImageInfo.path).split(path.sep).join('/')
    : null;

  return {
    component: componentSlug || path.basename(markdownPath, path.extname(markdownPath)),
    markdown_path: markdownPath,
    spec_path: specPath,
    source_url: figmaUrl || undefined,
    node_id: mainResult.normalizedNodeId,
    format,
    scale,
    screenshot_url: mainResult.imageUrlRaw,
    image_url: mainResult.imageUrlRaw,
    image_path: localImagePathForJson,
    image_sha256: localImageInfo.sha256,
    image_bytes: localImageInfo.bytes,
    image_content_type: localImageInfo.contentType,
    image_width: localImageInfo.width,
    image_height: localImageInfo.height,
    captured_at: capturedAt,
    captured_with: 'figma_take_screenshot',
    image: {
      path: localImagePathForJson,
      sha256: localImageInfo.sha256,
      bytes: localImageInfo.bytes,
      content_type: localImageInfo.contentType,
      width: localImageInfo.width,
      height: localImageInfo.height,
    },
    variants_count: variantProofs.length,
    variants: variantProofs,
  };
}

/**
 * Build visual section lines for markdown.
 */
export function buildVisualSectionLines({
  mainResult,
  localImageInfo,
  variantProofs,
  capturedAt,
  artifactPathForMarkdown,
  markdownPath,
}: {
  mainResult: MainCaptureResult;
  localImageInfo: LocalImageInfo;
  variantProofs: VisualProofVariant[];
  capturedAt: string;
  artifactPathForMarkdown: string;
  markdownPath: string;
}): string[] {
  const capturedDate = capturedAt.slice(0, 10);
  const localImagePathForMarkdown = localImageInfo.path
    ? path.relative(path.dirname(markdownPath), localImageInfo.path).split(path.sep).join('/')
    : '';

  return [
    '### Visual Proof',
    '',
    ...(localImagePathForMarkdown
      ? [`![Visual proof snapshot](${localImagePathForMarkdown})`, '']
      : []),
    `- Screenshot: [Captured (${capturedDate})](${mainResult.imageUrlRaw})`,
    `- Source node: \`${mainResult.normalizedNodeId}\``,
    ...(localImageInfo.sha256
      ? [`- Image hash: \`${localImageInfo.sha256}\``]
      : []),
    ...(variantProofs.length > 0
      ? [`- Variants captured: \`${variantProofs.length}\``]
      : []),
    `- Artifact: \`${artifactPathForMarkdown}\``,
  ];
}
