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
import { splitFrontmatter } from '../services/capture-visual-proof-io.js';
import { upsertVisualProofInOverview } from '../services/capture-visual-proof-payload.js';
import {
  captureMainImage,
  captureVariantImages,
  MainCaptureContext,
  VariantCaptureContext,
  downloadAndStoreMainImage,
  loadPreviousProofImagePaths,
} from '../services/capture-visual-proof-image.js';
import {
  buildVisualSectionLines,
  writeProofArtifacts,
  buildCaptureReport,
} from '../services/capture-visual-proof-payload.js';
import { persistCaptureReportToDb } from '../services/capture-db-persistence.js';
import { CaptureError } from '../services/capture-visual-proof-error.js';
import { prepareCaptureContext } from '../services/capture-visual-proof-preparation.js';
import { parseArgs, printUsage } from '../utils/parse-args.js';
import { isMain } from '../utils/is-main.js';
import { logger } from '../utils/logger.js';
import { PROJECT_ROOT } from '../utils/system-context.js';

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
      description: 'Base directory for visual proof assets.',
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
      name: '--skip-db-persistence <true|false>',
      description:
        'Skip SQLite persistence for this single capture report (used by batch orchestrators).',
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
  const proofRecordPath = path.join(
    ctx.proofDir,
    `${ctx.componentSlug || 'component'}.proof`,
  );
  const localImageInfo = await downloadAndStoreMainImage(ctx, mainResult);

  // 4. Load previous proof image paths for cleanup
  const previousProofImagePaths = await loadPreviousProofImagePaths(
    proofRecordPath,
    ctx.docsRootDir,
    ctx.dryRun,
  );

  // 5. Capture variants
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

  const rawMarkdown = fs.readFileSync(ctx.markdownPath, 'utf8');
  const { frontmatterRaw, content } = splitFrontmatter(rawMarkdown);
  const visualSectionLines = buildVisualSectionLines({
    mainResult,
    localImageInfo,
    variantProofs,
    capturedAt,
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

  let dbPersistence:
    | {
      ok: true;
      attempted?: number;
      upserted?: number;
      skipped?: number;
    }
    | undefined;
  if (!ctx.dryRun && !ctx.skipDbPersistence) {
    try {
      const persistence = persistCaptureReportToDb({
        projectRoot: PROJECT_ROOT,
        systemId: ctx.systemId,
        payload: {
          source: {
            figma_url: ctx.figmaUrl,
            file_key: ctx.figmaFileKey,
          },
          targets: [
            {
              slug: ctx.componentSlug,
              node_id: ctx.nodeId,
              markdown_path: ctx.markdownPath,
            },
          ],
          captured: [
            {
              slug: ctx.componentSlug,
              node_id: mainResult.normalizedNodeId,
              markdown_path: ctx.markdownPath,
              local_image_path: localImageInfo.path,
              screenshot_url: mainResult.imageUrlRaw,
              variants_count: variantProofs.length,
              captured_at: capturedAt,
              image_sha256: localImageInfo.sha256,
              image_bytes: localImageInfo.bytes,
              image_content_type: localImageInfo.contentType,
              image_width: localImageInfo.width,
              image_height: localImageInfo.height,
              variants: variantProofs,
            },
          ],
        },
      });
      dbPersistence = { ok: true, ...persistence };
    } catch (error) {
      throw new CaptureError(
        `DB persistence failed before markdown upsert; no proof artifacts were written. ${error instanceof Error ? error.message : String(error)}`,
        'DB_PERSISTENCE_FAILED',
      );
    }
  }

  // 8. Write artifacts and cleanup stale images
  const deletedStaleImages = writeProofArtifacts(
    ctx,
    ctx.markdownPath,
    frontmatterRaw,
    nextContent,
    localImageInfo,
    variantProofs,
    previousProofImagePaths,
  );

  // 9. Build and output report
  const report = buildCaptureReport(
    ctx,
    mainResult,
    localImageInfo,
    variantProofs,
    capturedAt,
    proofRecordPath,
    deletedStaleImages,
  );
  if (dbPersistence) {
    report.db_persistence = dbPersistence;
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args) as CaptureVisualProofArgs;
  if (parsed.help === true || parsed.help === 'true') {
    printUsage(USAGE, { exitCode: 0 });
    process.exit(0);
  }
  runCaptureVisualProof(parsed).catch((error) => {
    if (error instanceof CaptureError) {
      logger.error(`[${error.code}] ${error.message}`);
    } else {
      logger.error(error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
  });
}
