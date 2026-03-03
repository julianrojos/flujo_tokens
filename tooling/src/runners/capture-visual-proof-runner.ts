#!/usr/bin/env node

/**
 * Capture visual proof runner
 *
 * Capture a Figma screenshot proof and upsert `### Visual Proof` under `## Overview`
 * for a component markdown doc.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CaptureVisualProofArgs, CaptureVisualProofReport } from '../types/capture-visual-proof.js';
import type { LocalImageInfo, VisualProofVariant } from '../types/capture-visual-proof.js';
import type { CaptureVisualProofContext } from '../services/capture-visual-proof-preparation.js';
import {
  writeBufferAtomic,
  writeTextAtomic,
  sha256Hex,
  normalizeImageExtension,
  extractImageDimensions,
  downloadBinary,
  splitFrontmatter,
  collectProofImagePaths,
  resolveProofImageAbsolutePath,
  removeEmptyParentDirs,
  upsertVisualProofInOverview,
  captureMainImage,
  captureVariantImages,
  MainCaptureContext,
  VariantCaptureContext,
  buildProofPayload,
  buildVisualSectionLines,
} from '../services/capture-visual-proof-services.js';
import { CaptureError } from '../services/capture-visual-proof-error.js';
import { prepareCaptureContext } from '../services/capture-visual-proof-preparation.js';
import { parseArgs, printUsage } from '../utils/parse-args.js';
import { isMain } from '../utils/is-main.js';
import { syncDocumentationIndices } from '../services/component-registry-index.js';
import { logger } from '../utils/logger.js';

const USAGE = {
  command:
    'npm run ds:capture-visual-proof -- --component-name Alert [--agent codex]',
  description:
    'Capture a Figma screenshot proof and upsert `### Visual Proof` under `## Overview` for a component markdown doc.',
  options: [
    {
      name: '--component-name <name>',
      description:
        'Component display name used to infer markdown/spec file paths.',
    },
    {
      name: '--markdown <path>',
      description: 'Explicit markdown path (defaults to docs/components/<slug>.md).',
    },
    {
      name: '--spec-file <path>',
      description: 'Explicit spec path (defaults to docs/_spec/components/<slug>.yml).',
    },
    {
      name: '--component-set-id <node-id>',
      description: 'Explicit Figma component set node id (overrides spec value).',
    },
    {
      name: '--url <figma-url>',
      description: 'Optional Figma URL context for the agent.',
    },
    {
      name: '--figma-token <token>',
      description:
        'Figma token for variant capture via REST API (falls back to FIGMA_TOKEN).',
    },
    {
      name: '--agent <codex|claude|gemini|auto>',
      description: 'Agent CLI used to execute MCP screenshot capture.',
      defaultValue: 'auto',
    },
    {
      name: '--main-capture-mode <auto|agent|rest>',
      description:
        'Capture strategy for main screenshot. `auto` prefers REST when FIGMA token+file key are available.',
      defaultValue: 'auto',
    },
    {
      name: '--format <png|jpg|svg|pdf>',
      description: 'Screenshot format passed to figma_take_screenshot',
      defaultValue: 'png',
    },
    {
      name: '--scale <number>',
      description: 'Screenshot scale passed to figma_take_screenshot.',
      defaultValue: '2',
    },
    {
      name: '--proof-dir <path>',
      description: 'Output directory for visual proof metadata JSON.',
      defaultValue: 'docs/_generated/visual-proofs',
    },
    {
      name: '--proof-image-dir <path>',
      description:
        'Output directory for local visual proof images.',
      defaultValue: 'docs/_generated/visual-proofs/images',
    },
    {
      name: '--store-local-image <true|false>',
      description:
        'Download screenshot URL and persist a local image for deterministic dashboard rendering.',
      defaultValue: 'true',
    },
    {
      name: '--require-local-image <true|false>',
      description:
        'Fail when local image persistence fails.',
      defaultValue: 'true',
    },
    {
      name: '--download-timeout-ms <number>',
      description: 'Timeout for screenshot URL download in milliseconds.',
      defaultValue: '30000',
    },
    {
      name: '--include-variants <true|false>',
      description:
        'Capture one screenshot per variant (for component sets).',
      defaultValue: 'true',
    },
    {
      name: '--variant-limit <number>',
      description:
        'Maximum number of variants to capture (sorted deterministically).',
      defaultValue: '6',
    },
    {
      name: '--dry-run <true|false>',
      description: 'Report changes without writing files.',
      defaultValue: 'false',
    },
    {
      name: '--skip-index-sync <true|false>',
      description:
        'Skip registry+overview synchronization (useful when orchestrating batch captures).',
      defaultValue: 'false',
    },
    {
      name: '--system <id>',
      description: 'Target design system context.',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

/**
 * Main capture function.
 */
export async function runCaptureVisualProof(args: CaptureVisualProofArgs = {}): Promise<void> {
  // Handle --help before preparing context
  if (String(args.help || 'false') === 'true') {
    printUsage(USAGE, { exitCode: 0 });
    return;
  }

  // 1. Prepare context
  const ctx = prepareCaptureContext(args);

  // 2. Capture main image
  const mainCtx: MainCaptureContext = {
    figmaUrl: ctx.figmaUrl,
    nodeId: ctx.nodeId,
    format: ctx.format,
    scale: ctx.scale,
    figmaToken: ctx.figmaToken,
    figmaFileKey: ctx.figmaFileKey,
    agent: ctx.agent,
    componentSlug: ctx.componentSlug,
    mainCaptureMode: ctx.mainCaptureMode,
    downloadTimeoutMs: ctx.downloadTimeoutMs,
  };
  const mainResult = await captureMainImage(mainCtx);

  // 3. Download and store local image
  const capturedAt = new Date().toISOString();
  const proofFilePath = path.join(
    ctx.proofDir,
    `${ctx.componentSlug || 'component'}.json`,
  );
  const localImageInfo: LocalImageInfo = {
    path: null,
    sha256: null,
    bytes: null,
    contentType: null,
    width: null,
    height: null,
  };

  let previousProofImagePaths: string[] = [];
  if (!ctx.dryRun && fs.existsSync(proofFilePath)) {
    try {
      const previousPayload = JSON.parse(fs.readFileSync(proofFilePath, 'utf8'));
      previousProofImagePaths = collectProofImagePaths({
        proofPayload: previousPayload,
        docsRootDir: ctx.docsRootDir,
      });
    } catch {
      previousProofImagePaths = [];
    }
  }

  if (ctx.storeLocalImage) {
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
  }

  // 4. Capture variants
  const variantProofs: VisualProofVariant[] = [];
  if (ctx.includeVariants) {
    const variantCtx: VariantCaptureContext = {
      figmaToken: ctx.figmaToken,
      figmaFileKey: ctx.figmaFileKey,
      normalizedNodeId: mainResult.normalizedNodeId,
      format: ctx.format,
      scale: ctx.scale,
      downloadTimeoutMs: ctx.downloadTimeoutMs,
      variantLimit: ctx.variantLimit,
      componentSlug: ctx.componentSlug,
      proofImageDir: ctx.proofImageDir,
      docsRootDir: ctx.docsRootDir,
      storeLocalImage: ctx.storeLocalImage,
      requireLocalImage: ctx.requireLocalImage,
      dryRun: ctx.dryRun,
    };
    try {
      variantProofs.push(...await captureVariantImages(variantCtx, capturedAt));
    } catch (error) {
      if (ctx.requireLocalImage) {
        throw error;
      }
      logger.warn(`Warning: variant capture failed (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  const artifactPathForMarkdown =
    (
      path.relative(path.dirname(ctx.markdownPath), proofFilePath) ||
      path.basename(proofFilePath)
    ).split(path.sep).join('/');

  const proofPayload = buildProofPayload({
    componentSlug: ctx.componentSlug,
    markdownPath: ctx.markdownPath,
    specPath: ctx.specPath,
    figmaUrl: ctx.figmaUrl,
    mainResult: mainResult,
    localImageInfo,
    variantProofs,
    capturedAt,
    format: ctx.format,
    scale: ctx.scale,
    docsRootDir: ctx.docsRootDir,
  });

  const rawMarkdown = fs.readFileSync(ctx.markdownPath, 'utf8');
  const { frontmatterRaw, content } = splitFrontmatter(rawMarkdown);
  const visualSectionLines = buildVisualSectionLines({
    mainResult,
    localImageInfo,
    variantProofs,
    capturedAt,
    artifactPathForMarkdown,
    markdownPath: ctx.markdownPath,
  });

  let nextContent = '';
  try {
    nextContent = upsertVisualProofInOverview(content, visualSectionLines);
  } catch (error) {
    throw new CaptureError(
      error instanceof Error ? error.message : String(error),
      'MARKDOWN_UPSERT_FAILED',
    );
  }

  const deletedStaleImages: string[] = [];

  if (!ctx.dryRun) {
    fs.mkdirSync(ctx.proofDir, { recursive: true });
    writeTextAtomic(
      proofFilePath,
      `${JSON.stringify(proofPayload, null, 2)}\n`,
    );
    const markdownPrefix = frontmatterRaw
      ? `${frontmatterRaw}\n`
      : '';
    writeTextAtomic(
      ctx.markdownPath,
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
  }

  const report: CaptureVisualProofReport = {
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
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args) as CaptureVisualProofArgs;
  runCaptureVisualProof(parsed).catch((error) => {
    if (error instanceof CaptureError) {
      logger.error(`[${error.code}] ${error.message}`);
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  });
}
