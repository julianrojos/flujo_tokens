/**
 * Capture Visual Proof I/O
 *
 * Low-level I/O primitives for visual proof capture.
 * These functions are domain-agnostic and could be moved to utils/ in the future.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  LocalImageInfo,
  DownloadedBinary,
  ImageDimensions,
  SplitFrontmatterResult,
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
 * Write JSON file atomically.
 */
export function writeJsonFileAtomic(filePath: string, payload: unknown): string {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, resolved);
  return resolved;
}
