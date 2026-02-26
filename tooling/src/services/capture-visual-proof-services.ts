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
} from '../types/capture-visual-proof.js';

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
