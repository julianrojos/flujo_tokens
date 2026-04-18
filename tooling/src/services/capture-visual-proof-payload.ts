/**
 * Capture Visual Proof Payload
 *
 * Functions for building visual proof payloads and cleanup/reporting.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  LocalImageInfo,
  VisualProofVariant,
  CaptureVisualProofReport,
} from '../types/capture-visual-proof.js';
import type { MainCaptureResult } from './capture-visual-proof-image.js';
import {
  resolveProofImageAbsolutePath,
  removeEmptyParentDirs,
} from './capture-visual-proof-io.js';

/**
 * Write proof artifacts and cleanup stale images.
 */
export function writeProofArtifacts(
  ctx: {
    proofDir: string;
    proofImageDir: string;
    docsRootDir: string;
    dryRun: boolean;
  },
  localImageInfo: LocalImageInfo,
  variantProofs: VisualProofVariant[],
  previousProofImagePaths: string[],
): string[] {
  const deletedStaleImages: string[] = [];

  if (ctx.dryRun) {
    return deletedStaleImages;
  }

  fs.mkdirSync(ctx.proofDir, { recursive: true });

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
    format: string;
    scale: number;
  },
  mainResult: MainCaptureResult,
  localImageInfo: LocalImageInfo,
  variantProofs: VisualProofVariant[],
  capturedAt: string,
  proofImagesSlugPath: string,
  deletedStaleImages: string[],
): CaptureVisualProofReport {
  return {
    ok: true,
    dryRun: ctx.dryRun,
    component: ctx.componentSlug,
    proofImagesSlugPath,
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
