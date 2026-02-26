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
import type { VisualProofPayload, LocalImageInfo, VisualProofVariant } from '../types/capture-visual-proof.js';
import {
  writeBufferAtomic,
  writeTextAtomic,
  sha256Hex,
  normalizeImageExtension,
  extractImageDimensions,
  downloadBinary,
  splitFrontmatter,
  parseFigmaFileKeyFromUrl,
  collectProofImagePaths,
  resolveProofImageAbsolutePath,
  removeEmptyParentDirs,
  loadSpecFigma,
  resolveFigmaFileKey,
  extractVariantNodes,
  extractFirstJsonObject,
  upsertVisualProofInOverview,
  buildCapturePrompt,
  parseBooleanOption,
  parsePositiveInteger,
  parseMainCaptureMode,
  normalizeVariantSlug,
} from '../services/capture-visual-proof-services.js';
import { parseArgs, printUsage } from '../utils/parse-args.js';
import { isMain } from '../utils/is-main.js';
import { runAgentPrompt } from '../services/agent-runner.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import {
  componentNameToSnakeCase,
  normalizeComponentName,
} from '../utils/component-name.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';
import { normalizeNodeId, isValidNodeId } from '../utils/figma-node-id.js';
import { syncDocumentationIndices } from '../../scripts/lib/component-registry/index.mjs';
import { fetchFigmaImages, fetchFigmaNodes } from '../utils/figma-api.js';
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
 * Resolve node ID from CLI arg or spec.
 */
function resolveNodeId({
  cliNodeIdRaw,
  specPath,
  specFigma,
}: {
  cliNodeIdRaw: string;
  specPath: string;
  specFigma: Record<string, unknown>;
}): string {
  const cliNodeId = normalizeNodeId(String(cliNodeIdRaw || '').trim());
  if (cliNodeId) {
    if (!isValidNodeId(cliNodeId)) {
      throw new Error(
        `Invalid --component-set-id format: ${cliNodeIdRaw}. Expected 123:456.`,
      );
    }
    return cliNodeId;
  }

  if (!fs.existsSync(specPath)) {
    throw new Error(
      `Missing spec file and no --component-set-id provided: ${specPath}`,
    );
  }

  const figma = specFigma && typeof specFigma === 'object' ? specFigma : {};
  const nodeId = normalizeNodeId(String((figma as Record<string, string>).component_set_node_id || '').trim());
  if (!nodeId || !isValidNodeId(nodeId)) {
    throw new Error(
      'Unable to resolve a valid figma.component_set_node_id from spec. ' +
        'Provide --component-set-id explicitly or update the spec.',
    );
  }
  return nodeId;
}

/**
 * Main capture function.
 */
export async function runCaptureVisualProof(args: CaptureVisualProofArgs = {}): Promise<void> {
  if (String(args.help || 'false') === 'true') {
    printUsage(USAGE, { exitCode: 0 });
  }

  const componentInput = String(args['component-name'] || '').trim();
  const normalizedComponent = normalizeComponentName(componentInput);
  const explicitMarkdownPath = String(args.markdown || '').trim();
  const slugFromMarkdown = explicitMarkdownPath
    ? path.basename(explicitMarkdownPath, path.extname(explicitMarkdownPath))
    : '';
  const componentSlug =
    normalizedComponent.fileSlug ||
    componentNameToSnakeCase(componentInput) ||
    slugFromMarkdown;

  if (!componentSlug && !explicitMarkdownPath) {
    logger.error(
      'Missing --component-name or --markdown. One of them is required.',
    );
    printUsage(USAGE, { stream: 'stderr' as const, exitCode: 1 });
  }

  const ctx = resolveSystemContextSafe({ system: args.system });

  const docsRootInput = path.resolve(args['docs-root'] || ctx.paths.docs);
  const componentDocsDir =
    path.basename(docsRootInput) === 'components'
      ? docsRootInput
      : path.join(docsRootInput, 'components');
  const docsRootDir =
    path.basename(docsRootInput) === 'components'
      ? path.dirname(docsRootInput)
      : docsRootInput;
  const specRoot = path.resolve(
    args['spec-root'] || ctx.paths.specs,
  );
  const markdownPath = path.resolve(
    explicitMarkdownPath || path.join(componentDocsDir, `${componentSlug}.md`),
  );
  const specPath = path.resolve(
    args['spec-file'] || path.join(specRoot, `${componentSlug}.yml`),
  );
  const specFigma = loadSpecFigma(specPath, parseYamlDocument);
  const proofDir = path.resolve(
    args['proof-dir'] || path.join(ctx.paths.generated, 'visual-proofs'),
  );
  const proofImageDir = path.resolve(
    args['proof-image-dir'] ||
      path.join(ctx.paths.generated, 'visual-proofs', 'images'),
  );
  const format = String(args.format || 'png').trim().toLowerCase();
  const scale = Number(args.scale || 2);
  const figmaUrl = String(args.url || '').trim();
  const agent = String(args.agent || process.env.DS_AGENT || 'auto');
  const mainCaptureMode = parseMainCaptureMode(String(args['main-capture-mode'] || 'auto'));
  const dryRun = parseBooleanOption(args['dry-run'], '--dry-run', false);
  const skipIndexSync = parseBooleanOption(
    args['skip-index-sync'],
    '--skip-index-sync',
    false,
  );
  const storeLocalImage = parseBooleanOption(
    args['store-local-image'],
    '--store-local-image',
    true,
  );
  const requireLocalImage = parseBooleanOption(
    args['require-local-image'],
    '--require-local-image',
    true,
  );
  const downloadTimeoutMs = parsePositiveInteger(
    args['download-timeout-ms'],
    '--download-timeout-ms',
    30000,
  );
  const includeVariants = parseBooleanOption(
    args['include-variants'],
    '--include-variants',
    true,
  );
  const variantLimit = parsePositiveInteger(
    args['variant-limit'],
    '--variant-limit',
    6,
  );
  const figmaToken = String(args['figma-token'] || process.env.FIGMA_TOKEN || '').trim();
  const figmaFileKey = resolveFigmaFileKey({
    figmaUrl,
    specFigma,
  });

  if (!fs.existsSync(markdownPath)) {
    logger.error(`Markdown file not found: ${markdownPath}`);
    process.exit(1);
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    logger.error(`Invalid --scale value: ${args.scale}`);
    process.exit(1);
  }

  let nodeId = '';
  try {
    nodeId = resolveNodeId({
      cliNodeIdRaw: String(args['component-set-id'] || ''),
      specPath,
      specFigma,
    });
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const prompt = buildCapturePrompt({ figmaUrl, nodeId, format, scale });
  const canUseRest = Boolean(figmaToken && figmaFileKey);
  const useRestForMainCapture =
    mainCaptureMode === 'rest' || (mainCaptureMode === 'auto' && canUseRest);

  let imageUrlRaw = '';
  let normalizedNodeId = nodeId;

  if (useRestForMainCapture) {
    if (!figmaToken || !figmaFileKey) {
      logger.error(
        'Main capture mode `rest` requires --figma-token (or FIGMA_TOKEN) and a resolvable Figma file key.',
      );
      process.exit(1);
    }
    try {
      const imagePayload = await fetchFigmaImages({
        fileKey: figmaFileKey,
        nodeIds: [nodeId],
        token: figmaToken,
        format,
        scale,
        timeoutMs: downloadTimeoutMs,
      }) as { images: Record<string, string> | null };
      const imageMap =
        imagePayload?.images ? (imagePayload.images as Record<string, string>) : {};
      imageUrlRaw = String(imageMap[nodeId] || '').trim();
      normalizedNodeId = nodeId;
    } catch (error) {
      logger.error(
        `Main screenshot capture via REST failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exit(1);
    }
  } else {
    let response;
    try {
      response = runAgentPrompt({
        prompt,
        agent: agent as 'codex' | 'claude' | 'gemini' | 'auto',
        label: `capture-visual-proof-${componentSlug || 'component'}`,
        passthrough: false,
      });
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    const payload = extractFirstJsonObject(response.stdout || '');
    if (!payload || typeof payload !== 'object') {
      logger.error(
        'Unable to parse JSON screenshot payload from agent output. ' +
          'Run again with --agent codex and verify MCP connectivity.',
      );
      process.exit(1);
    }

    imageUrlRaw = String(
      (payload as Record<string, string>).image_url || (payload as Record<string, string>).url || (payload as Record<string, string>).imageUrl || '',
    ).trim();
    const nodeIdRaw = String((payload as Record<string, string>).node_id || (payload as Record<string, string>).nodeId || nodeId).trim();
    normalizedNodeId = normalizeNodeId(nodeIdRaw) || nodeId;
  }

  const captureSource = useRestForMainCapture ? 'REST' : 'Agent';

  if (!/^https?:\/\/\S+$/i.test(imageUrlRaw)) {
    logger.error(
      `${captureSource} output did not include a valid image URL. Received: ${imageUrlRaw || '<empty>'}`,
    );
    process.exit(1);
  }
  if (!isValidNodeId(normalizedNodeId)) {
    logger.error(
      `${captureSource} output did not include a valid node id. Received: <invalid-node-id>`,
    );
    process.exit(1);
  }

  const capturedAt = new Date().toISOString();
  const proofFilePath = path.join(
    proofDir,
    `${componentSlug || 'component'}.json`,
  );
  const localImageInfo: LocalImageInfo = {
    path: null,
    sha256: null,
    bytes: null,
    contentType: null,
    width: null,
    height: null,
  };
  const variantProofs: VisualProofVariant[] = [];
  let previousProofImagePaths: string[] = [];
  if (!dryRun && fs.existsSync(proofFilePath)) {
    try {
      const previousPayload = JSON.parse(fs.readFileSync(proofFilePath, 'utf8'));
      previousProofImagePaths = collectProofImagePaths({
        proofPayload: previousPayload,
        docsRootDir,
      });
    } catch {
      previousProofImagePaths = [];
    }
  }

  if (storeLocalImage) {
    try {
      const downloaded = await downloadBinary(imageUrlRaw, downloadTimeoutMs);
      const extension = normalizeImageExtension(
        format,
        downloaded.contentType,
        imageUrlRaw,
      );
      const localImagePath = path.join(
        proofImageDir,
        `${componentSlug || 'component'}.${extension}`,
      );
      const dimensions = extractImageDimensions(downloaded.buffer, extension);

      if (!dryRun) {
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
      if (requireLocalImage) {
        logger.error(
          `Unable to persist local visual proof image: ${reason}`,
        );
        process.exit(1);
      }
      logger.warn(
        `Warning: local visual proof image was not stored (${reason}).`,
      );
    }
  }

  if (includeVariants) {
    if (!figmaToken || !figmaFileKey) {
      logger.warn(
        'Variant capture skipped: missing FIGMA token or file key.',
      );
    } else {
      try {
        const variantTree = await fetchFigmaNodes({
          fileKey: figmaFileKey,
          nodeIds: [normalizedNodeId],
          token: figmaToken,
          depth: 2,
          timeoutMs: downloadTimeoutMs,
        });
        const variantNodes = extractVariantNodes(variantTree as unknown as Record<string, unknown>, normalizedNodeId, normalizeNodeId, isValidNodeId).slice(
          0,
          variantLimit,
        );

        if (variantNodes.length > 0) {
          const imagePayload = await fetchFigmaImages({
            fileKey: figmaFileKey,
            nodeIds: variantNodes.map((variant) => variant.nodeId),
            token: figmaToken,
            format,
            scale,
            timeoutMs: downloadTimeoutMs,
          }) as { images: Record<string, string> | null };

          const imageMap =
            imagePayload?.images ? (imagePayload.images as Record<string, string>) : {};

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

            if (storeLocalImage) {
              try {
                const downloaded = await downloadBinary(
                  screenshotUrl,
                  downloadTimeoutMs,
                );
                const extension = normalizeImageExtension(
                  format,
                  downloaded.contentType,
                  screenshotUrl,
                );
                const variantSlug = normalizeVariantSlug(variant.name) || `variant_${index + 1}`;
                const localVariantPath = path.join(
                  proofImageDir,
                  'variants',
                  `${componentSlug || 'component'}__${String(index + 1).padStart(2, '0')}__${variantSlug}.${extension}`,
                );
                const dimensions = extractImageDimensions(
                  downloaded.buffer,
                  extension,
                );
                if (!dryRun) {
                  writeBufferAtomic(localVariantPath, downloaded.buffer);
                }
                variantInfo.image_path = path
                  .relative(docsRootDir, localVariantPath)
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
                if (requireLocalImage) {
                  throw new Error(
                    `Unable to persist local image for variant '${variant.name}': ${reason}`,
                  );
                }
                logger.warn(
                  `Warning: local image for variant '${variant.name}' was not stored (${reason}).`,
                );
              }
            }

            variantProofs.push(variantInfo);
          }
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (requireLocalImage) {
          logger.error(`Variant capture failed: ${reason}`);
          process.exit(1);
        }
        logger.warn(`Warning: variant capture failed (${reason}).`);
      }
    }
  }

  const artifactPathForMarkdown =
    (
      path.relative(path.dirname(markdownPath), proofFilePath) ||
      path.basename(proofFilePath)
    ).split(path.sep).join('/');
  const localImagePathForMarkdown = localImageInfo.path
    ? (
        path.relative(path.dirname(markdownPath), localImageInfo.path) ||
        path.basename(localImageInfo.path)
      ).split(path.sep).join('/')
    : '';
  const localImagePathForJson = localImageInfo.path
    ? path.relative(docsRootDir, localImageInfo.path).split(path.sep).join('/')
    : null;

  const proofPayload: VisualProofPayload = {
    component: componentSlug || path.basename(markdownPath, path.extname(markdownPath)),
    markdown_path: markdownPath,
    spec_path: specPath,
    source_url: figmaUrl || undefined,
    node_id: normalizedNodeId,
    format,
    scale,
    screenshot_url: imageUrlRaw,
    image_url: imageUrlRaw,
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

  const rawMarkdown = fs.readFileSync(markdownPath, 'utf8');
  const { frontmatterRaw, content } = splitFrontmatter(rawMarkdown);
  const capturedDate = capturedAt.slice(0, 10);
  const visualSectionLines = [
    '### Visual Proof',
    '',
    ...(localImagePathForMarkdown
      ? [`![Visual proof snapshot](${localImagePathForMarkdown})`, '']
      : []),
    `- Screenshot: [Captured (${capturedDate})](${imageUrlRaw})`,
    `- Source node: \`${normalizedNodeId}\``,
    ...(localImageInfo.sha256
      ? [`- Image hash: \`${localImageInfo.sha256}\``]
      : []),
    ...(variantProofs.length > 0
      ? [`- Variants captured: \`${variantProofs.length}\``]
      : []),
    `- Artifact: \`${artifactPathForMarkdown}\``,
  ];

  let nextContent = '';
  try {
    nextContent = upsertVisualProofInOverview(content, visualSectionLines);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const deletedStaleImages: string[] = [];

  if (!dryRun) {
    fs.mkdirSync(proofDir, { recursive: true });
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
        docsRootDir,
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
          path.relative(docsRootDir, absoluteOldPath).split(path.sep).join('/'),
        );
        removeEmptyParentDirs(path.dirname(absoluteOldPath), proofImageDir);
      } catch {
        // Best-effort cleanup; do not fail capture flow for stale artifacts.
      }
    }

    if (!skipIndexSync) {
      syncDocumentationIndices({
        docsDir: componentDocsDir,
        overviewPath: path.join(componentDocsDir, 'overview.md'),
        specsDir: path.dirname(specPath),
        proofsDir: proofDir,
        renderDir: path.join(docsRootDir, '_generated', 'figma_doc_models'),
        registryPath: path.join(docsRootDir, '_generated', 'component-registry.json'),
      });
    }
  }

  const report: CaptureVisualProofReport = {
    ok: true,
    dryRun,
    component: componentSlug,
    markdownPath,
    specPath,
    proofFilePath,
    localImagePath: localImageInfo.path,
    screenshotUrl: imageUrlRaw,
    nodeId: normalizedNodeId,
    format,
    scale,
    imageSha256: localImageInfo.sha256,
    variantsCount: variantProofs.length,
    mainCaptureMode: useRestForMainCapture ? 'rest' : 'agent',
    indexSyncSkipped: skipIndexSync,
    deletedStaleImages,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args) as CaptureVisualProofArgs;
  runCaptureVisualProof(parsed).catch((error) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
