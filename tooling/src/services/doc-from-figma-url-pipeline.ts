/**
 * Doc from Figma URL Pipeline
 *
 * Runs the doc generation pipeline: agent prompt → validation → drift → capture proof → sync.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseMarkdownFrontmatter } from '../utils/parse-frontmatter.js';
import { normalizeAgentOutputFile } from '../services/agent-output-normalizer.js';
import {
  validateAgentOutputContract,
  writeAgentOutputErrorReport,
} from '../utils/agent-output-contract.js';
import { updateAgentDriftBaseline } from '../services/agent-drift-detector.js';
import {
  assertDocStatusStable,
  assertEvidenceGatedScalarChanges,
} from '../services/evidence-gated-mutations.js';
import { assertScopedWritePolicy } from '../services/scoped-write-guard.js';
import { runOrThrow } from '../utils/exec.js';
import { syncDocumentationState } from '../services/component-registry-index.js';
import { runAgentPrompt } from '../services/agent-runner.js';
import { logger } from '../utils/logger.js';
import type { DocGenerationContext } from './doc-from-figma-url-context.js';

const FRONTMATTER_EVIDENCE_PREFIXES: readonly string[] = Object.freeze([
  'figma.file_url',
  'figma.page',
  'figma.component',
  'figma.component_set_node_id',
  'figma.last_verified',
  'figma.component_hash',
  'figma.properties_count',
  'figma.variants_count',
  'pipeline.ds_component_doc',
] as const);

/**
 * Run doc generation pipeline.
 *
 * Executes: agent prompt → normalize → validate → drift → capture proof → sync.
 * Throws Error instead of calling process.exit() for testability.
 */
export async function runDocGenerationPipeline(
  ctx: DocGenerationContext,
  prompt: string,
  outputSnapshot: { exists: boolean; content: string },
): Promise<void> {
  const previousFrontmatter = outputSnapshot.exists
    ? parseMarkdownFrontmatter(outputSnapshot.content).frontmatter
    : {};

  runAgentPrompt({
    prompt,
    agent: ctx.agent,
    label: `doc-from-figma-url-${ctx.componentSlug || 'component'}`,
  });
  if (!fs.existsSync(ctx.outputPath)) {
    throw new Error(
      `Agent did not produce markdown output at the required path: ${ctx.outputPath}`,
    );
  }
  normalizeAgentOutputFile(ctx.outputPath);

  const generatedMarkdown = fs.readFileSync(ctx.outputPath, 'utf8');
  const { frontmatter: generatedFrontmatter } =
    parseMarkdownFrontmatter(generatedMarkdown);
  if (outputSnapshot.exists) {
    assertDocStatusStable({
      beforeFrontmatter: previousFrontmatter,
      afterFrontmatter: generatedFrontmatter,
      allowDocStatusChange: ctx.allowDocStatusChange,
      label: `${ctx.outputPath} frontmatter`,
    });
    assertEvidenceGatedScalarChanges({
      before: previousFrontmatter,
      after: generatedFrontmatter,
      allowedKnownToKnownPrefixes: FRONTMATTER_EVIDENCE_PREFIXES,
      label: `${ctx.outputPath} frontmatter`,
    });
  }
  const outputContract = validateAgentOutputContract({
    markdown: generatedMarkdown,
    expectedComponentName: ctx.componentName || undefined,
  });
  if (outputContract.errors.length > 0) {
    const resolvedSlug = ctx.componentSlug || ctx.outputSlug;
    const reportPath = path.join(
      ctx.docsRootDir,
      '_generated',
      'agent_output_errors',
      `${resolvedSlug}.error.json`,
    );
    writeAgentOutputErrorReport({
      outputPath: reportPath,
      componentSlug: resolvedSlug,
      markdownPath: ctx.outputPath,
      scriptName: "ds-doc-from-figma-url",
      errors: outputContract.errors,
      rawOutput: generatedMarkdown,
    });
    throw new Error(
      'Generated markdown failed output contract.\n' +
      `Report: ${reportPath}\n` +
      `${JSON.stringify({ file: ctx.outputPath, errors: outputContract.errors }, null, 2)}`,
    );
  }

  const drift = updateAgentDriftBaseline({
    markdownPath: ctx.outputPath,
    componentSlug: ctx.componentSlug || ctx.outputSlug,
    scriptName: 'ds-doc-from-figma-url',
  });
  if (drift.driftDetected) {
    logger.warn(
      'Output contract drift detected.\n' +
      `Baseline: ${drift.baselinePath}\n` +
      `Previous hash: ${drift.previousHash}\n` +
      `Current hash: ${drift.hash}`,
    );
  }

  if (ctx.captureProof) {
    const resolvedSlug = ctx.componentSlug || ctx.outputSlug;
    const nodeId = String(ctx.componentNodeId || '').trim();
    if (!nodeId) {
      const message =
        'Visual proof capture skipped: no node-id was resolved from the Figma URL.';
      if (ctx.captureProofStrict) {
        throw new Error(message);
      }
      logger.warn(message);
    } else {
      try {
        runOrThrow(process.execPath, [
          ctx.captureVisualProofScriptPath,
          '--markdown',
          ctx.outputPath,
          '--spec-file',
          path.join(ctx.specComponentsDir, `${resolvedSlug}.yml`),
          '--component-set-id',
          nodeId,
          '--proof-dir',
          ctx.visualProofDir,
          '--proof-image-dir',
          ctx.visualProofImageDir,
          '--format',
          'png',
          '--agent',
          ctx.agent,
          '--include-variants',
          ctx.captureProofVariants ? 'true' : 'false',
          '--variant-limit',
          String(Math.floor(ctx.captureProofVariantLimit)),
          ...(ctx.figmaUrl ? ['--url', ctx.figmaUrl] : []),
          ...(ctx.figmaToken ? ['--figma-token', ctx.figmaToken] : []),
        ]);
      } catch (error) {
        const message = `Automatic visual proof capture failed: ${error instanceof Error ? error.message : String(error)
          }`;
        if (ctx.captureProofStrict) {
          throw new Error(message);
        }
        logger.warn(message);
      }
    }
  }

  await syncDocumentationState({
    docsDir: ctx.componentDocsDir,
    overviewPath: ctx.overviewPath,
    specsDir: ctx.specComponentsDir,
    proofsDir: ctx.visualProofDir,
    databaseUrl: ctx.databaseUrl,
    systemId: ctx.systemId,
  });
  runOrThrow(process.execPath, [
    ctx.tokenUsageScriptPath,
    '--registry',
    ctx.tokenRegistryPath,
    '--spec-root',
    ctx.specComponentsDir,
    '--out',
    ctx.tokenUsageIndexPath,
  ]);
  assertScopedWritePolicy({
    snapshot: ctx.scopeSnapshot,
    allowedPaths: ctx.allowedWritePaths,
    allowedPathPrefixes: ctx.allowedWritePathPrefixes,
    label: 'ds-doc-from-figma-url',
  });
  assertScopedWritePolicy({
    snapshot: ctx.proofScopeSnapshot,
    allowedPaths: ctx.allowedWritePaths,
    allowedPathPrefixes: ctx.allowedWritePathPrefixes,
    label: 'ds-doc-from-figma-url (proof images)',
  });
}
