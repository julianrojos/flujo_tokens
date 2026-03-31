/**
 * Capture Visual Proof Payload
 *
 * Functions for building visual proof payloads and markdown output.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  LocalImageInfo,
  VisualProofVariant,
  VisualProofPayload,
  CaptureVisualProofReport,
} from '../types/capture-visual-proof.js';
import type { MainCaptureResult } from './capture-visual-proof-image.js';
import {
  writeTextAtomic,
  resolveProofImageAbsolutePath,
  removeEmptyParentDirs,
} from './capture-visual-proof-io.js';

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
 * Write proof artifacts and cleanup stale images.
 */
export function writeProofArtifacts(
  ctx: {
    proofDir: string;
    proofImageDir: string;
    docsRootDir: string;
    componentDocsDir: string;
    specPath: string;
    dryRun: boolean;
  },
  markdownPath: string,
  frontmatterRaw: string,
  nextContent: string,
  localImageInfo: LocalImageInfo,
  variantProofs: VisualProofVariant[],
  previousProofImagePaths: string[],
): string[] {
  const deletedStaleImages: string[] = [];

  if (ctx.dryRun) {
    return deletedStaleImages;
  }

  fs.mkdirSync(ctx.proofDir, { recursive: true });
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
    format: string;
    scale: number;
  },
  mainResult: MainCaptureResult,
  localImageInfo: LocalImageInfo,
  variantProofs: VisualProofVariant[],
  capturedAt: string,
  proofRecordPath: string,
  deletedStaleImages: string[],
): CaptureVisualProofReport {
  return {
    ok: true,
    dryRun: ctx.dryRun,
    component: ctx.componentSlug,
    markdownPath: ctx.markdownPath,
    specPath: ctx.specPath,
    proofRecordPath,
    localImagePath: localImageInfo.path,
    screenshotUrl: mainResult.imageUrlRaw,
    nodeId: mainResult.normalizedNodeId,
    capturedAt,
    format: ctx.format,
    scale: ctx.scale,
    imageSha256: localImageInfo.sha256,
    imageBytes: localImageInfo.bytes,
    imageContentType: localImageInfo.contentType,
    imageWidth: localImageInfo.width,
    imageHeight: localImageInfo.height,
    variantsCount: variantProofs.length,
    variants: variantProofs,
    mainCaptureMode: mainResult.captureSource === 'REST' ? 'rest' : 'agent',
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
  markdownPath,
}: {
  mainResult: MainCaptureResult;
  localImageInfo: LocalImageInfo;
  variantProofs: VisualProofVariant[];
  capturedAt: string;
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
  ];
}
