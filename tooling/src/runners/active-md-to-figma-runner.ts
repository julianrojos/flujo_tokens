#!/usr/bin/env node

/**
 * Active Markdown to Figma Runner
 *
 * Render active markdown documentation to Figma using themed renderer.
 * TypeScript runner for ds-active-md-to-figma script.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseArgs } from '../utils/parse-args.js';
import { isMain } from '../utils/is-main.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { resolveSystemContextSafe, DEFAULT_THEME_PATH, PROJECT_ROOT } from '../utils/system-context.js';
import {
  normalizeComponentName,
  componentNameToSnakeCase,
} from '../utils/component-name.js';
import {
  computeFingerprint,
  loadSyncState,
  shouldSkipTask,
  updateTaskState,
} from '../utils/cache-utils.js';
import { parseYamlDocument } from '../utils/parse-frontmatter.js';
import { normalizeNodeId, isValidNodeId } from '../utils/figma-node-id.js';
import { isTbdMarker } from '../utils/tbd.js';
import { runOrThrow } from '../utils/exec.js';
import { executeVisualProofPhase } from '../services/visual-proof-phase.js';
import { TempArtifactManager } from '../services/temp-artifacts.js';
import { logger } from '../utils/logger.js';
import {
  validateSpecPreflight,
  ensureValidationResults,
} from '../services/spec-validation-phase.js';
import {
  executeAgentPrompt,
  type AgentExecutionResult,
} from '../services/agent-execution-phase.js';
import { detectMarkdownStaleness } from '../services/markdown-staleness.js';
import { readRenderExpectations } from '../services/render-expectations.js';
import { syncDocumentationIndices } from '../services/component-registry-index.js';
import {
  executeRenderAuditPhase,
  type RenderAuditPhaseResult,
} from '../services/render-audit-phase.js';
import {
  parseRenderReportFromOutput,
  validateRenderReport,
  validatePrimaryRenderReport,
  type RenderReport,
  type RenderReportValidationResult,
  type RenderAuditReport,
  type RenderExpectations,
} from '../services/render-report-parser.js';

/**
 * Context for active markdown to Figma execution.
 */
interface ActiveMdToFigmaContext {
  specPath: string;
  markdownPath: string;
  tokenRegistryPath: string;
  expectedThemeName: string;
  offsetX: number;
  force: boolean;
  skipValidation: boolean;
}

/**
 * Read theme name from theme file.
 */
function readThemeName(themePath: string): string {
  const parsed = parseYamlDocument(
    fs.readFileSync(themePath, 'utf8'),
    `theme YAML (${path.basename(themePath)})`,
  );
  const name = String((parsed as Record<string, unknown>)?.name || '').trim();
  if (!name) {
    throw new Error(
      `Missing required theme name in ${themePath}. Expected top-level "name".`,
    );
  }
  return name;
}

/**
 * Active markdown to Figma arguments.
 */
export interface ActiveMdToFigmaArgs {
  markdown?: string;
  'component-name'?: string;
  'spec-file'?: string;
  'skip-validation'?: string;
  force?: string;
  'sync-state'?: string;
  'token-registry'?: string;
  'capture-proof'?: string;
  'capture-proof-strict'?: string;
  'component-set-id'?: string;
  theme?: string;
  'generated-dir'?: string;
  'offset-x'?: string;
  url?: string;
  agent?: string;
  system?: string;
}

/**
 * Main active markdown to Figma function.
 */
export async function runActiveMdToFigma(
  args: ActiveMdToFigmaArgs = {},
): Promise<void> {
  const activeMarkdown =
    args.markdown ||
    process.env.ANTIGRAVITY_ACTIVE_FILE ||
    process.env.ACTIVE_FILE ||
    process.env.AG_ACTIVE_FILE;

  if (!activeMarkdown) {
    logger.error(
      'Missing active markdown path.\nUse --markdown <path> (and optionally --agent codex|claude|gemini) or export ANTIGRAVITY_ACTIVE_FILE.',
    );
    process.exit(1);
  }

  const markdownPath = path.resolve(activeMarkdown);
  if (!fs.existsSync(markdownPath)) {
    logger.error(`Markdown file not found: ${markdownPath}`);
    process.exit(1);
  }
  const ctx = resolveSystemContextSafe({ system: args.system });

  const fileBase = path.basename(markdownPath, path.extname(markdownPath));
  const normalizedName = normalizeComponentName(
    args['component-name'] || fileBase,
  );
  const componentName = normalizedName.displayName || 'Component';
  const componentSlug =
    normalizedName.fileSlug || componentNameToSnakeCase(fileBase);
  const specPath = path.resolve(
    args['spec-file'] ||
    path.join(ctx.paths.specs, `${componentSlug}.yml`),
  );

  if (!fs.existsSync(specPath)) {
    logger.error(
      'Missing required spec file.\n' +
      `Spec: ${specPath}\n` +
      `Run: npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}"`,
    );
    process.exit(1);
  }

  const skipValidation = String(args['skip-validation'] || 'false') === 'true';
  const force = String(args.force || 'false') === 'true';
  const syncStatePath = args['sync-state'] || undefined;
  const tokenRegistryPath =
    args['token-registry'] || ctx.paths.tokenRegistry;
  const captureProof = String(args['capture-proof'] || 'true') !== 'false';
  const captureProofStrict = String(args['capture-proof-strict'] || 'false') === 'true';

  let specStatus = 'draft';
  let specNodeId = '';
  try {
    const specParsed = parseYamlDocument(
      fs.readFileSync(specPath, 'utf8'),
      `spec YAML (${path.basename(specPath)})`,
    ) as Record<string, unknown>;
    specStatus = String(specParsed.status || 'draft')
      .trim()
      .toLowerCase();
    const specFigma =
      specParsed && typeof specParsed.figma === 'object'
        ? (specParsed.figma as Record<string, unknown>)
        : {};
    const specNodeIdRaw = String(specFigma?.component_set_node_id || '').trim();
    if (specNodeIdRaw && !isTbdMarker(specNodeIdRaw)) {
      const normalizedSpecNodeId = normalizeNodeId(specNodeIdRaw);
      if (!isValidNodeId(normalizedSpecNodeId)) {
        if (specStatus === 'ready') {
          logger.error(
            'Invalid figma.component_set_node_id in ready spec.\n' +
            `Spec: ${specPath}\n` +
            'Expected format: 123:456',
          );
          process.exit(1);
        }
        logger.warn(
          `Warning: ignoring invalid figma.component_set_node_id in spec (${specNodeIdRaw}).`,
        );
      } else {
        specNodeId = normalizedSpecNodeId;
      }
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const cliNodeIdRaw = String(args['component-set-id'] || '').trim();
  const cliNodeId = cliNodeIdRaw ? normalizeNodeId(cliNodeIdRaw) : '';
  if (cliNodeId && !isValidNodeId(cliNodeId)) {
    logger.error(
      'Invalid --component-set-id format.\n' +
      `Provided: ${cliNodeIdRaw}\n` +
      'Expected format: 123:456',
    );
    process.exit(1);
  }

  if (cliNodeId && specNodeId && cliNodeId !== specNodeId && !force) {
    logger.error(
      'Traceability mismatch between CLI and spec.\n' +
      `CLI --component-set-id: ${cliNodeId}\n` +
      `Spec figma.component_set_node_id: ${specNodeId}\n` +
      'Use --force true only if you intentionally want to override the spec.',
    );
    process.exit(1);
  }

  const resolvedComponentSetId = cliNodeId || specNodeId || '';
  if (!resolvedComponentSetId) {
    if (specStatus === 'ready') {
      logger.error(
        'Missing figma.component_set_node_id for ready spec.\n' +
        `Spec: ${specPath}\n` +
        'Add figma.component_set_node_id to the spec to keep Figma placement deterministic.',
      );
      process.exit(1);
    }
    logger.warn(
      'Warning: component_set_node_id not available. Falling back to name-based lookup (non-deterministic).',
    );
  }

  // Validate spec and markdown pre-flight (policy handled by spec-validation-phase service)
  try {
    const validationResult = validateSpecPreflight({
      specPath,
      tokenRegistryPath,
      markdownPath,
      skipValidation,
      force,
    });
    ensureValidationResults(validationResult, specPath);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (!force) {
    const staleness = detectMarkdownStaleness({
      specPath,
      markdownPath,
      syncStatePath,
    });
    if (staleness.stale) {
      logger.error(
        'Markdown is stale relative to its source spec. Rendering to Figma was blocked.\n' +
        `Reason: ${staleness.reason}\n` +
        `Spec: ${specPath}\n` +
        `Markdown: ${markdownPath}\n` +
        `Run: npm run ds:component-doc -- --spec-file "${specPath}" --output "${markdownPath}"\n` +
        'Use --force true only if you intentionally want to render without regenerating markdown.',
      );
      process.exit(1);
    }
  }

  const agent = args.agent || 'auto';
  const generatedDir = args['generated-dir'] || path.join(ctx.paths.generated, 'figma_doc_models');
  const tempArtifacts = new TempArtifactManager();
  tempArtifacts.attachProcessHooks();
  const staleArtifacts = tempArtifacts.purgeMatching({
    dir: generatedDir,
    matcher: (name: string) => [
      `${fileBase}.render-agent-output.txt`,
      `${fileBase}.render-audit-output.txt`,
    ].includes(name),
  });
  if (staleArtifacts.removed.length > 0) {
    logger.warn(
      `Removed stale temporary artifacts for ${fileBase}: ${staleArtifacts.removed
        .map((artifactPath) => path.basename(artifactPath))
        .join(', ')}`,
    );
  }
  const themePath = args.theme || DEFAULT_THEME_PATH;
  const expectedThemeName = readThemeName(themePath);
  const docModelPath = path.join(generatedDir, `${fileBase}.doc-model.json`);
  const executePath = path.join(generatedDir, `${fileBase}.figma-execute.js`);
  const payloadPath = path.join(
    generatedDir,
    `${fileBase}.render-payload.json`,
  );
  const offsetX = args['offset-x'] || '200';
  const figmaUrl = args.url;
  const markdownToModelScriptPath = path.resolve(
    '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/markdown_to_doc_model.mjs',
  );
  const modelToExecuteScriptPath = path.resolve(
    '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/build_figma_execute_code.mjs',
  );

  fs.mkdirSync(path.resolve(generatedDir), { recursive: true });

  const modelTaskId = `ds-markdown-to-figma:model:${path.resolve(markdownPath)}`;
  const modelFingerprint = computeFingerprint({
    files: [markdownPath, markdownToModelScriptPath],
    values: {
      componentName,
      docModelPath: path.resolve(docModelPath),
    },
  });
  const modelSync = shouldSkipTask({
    taskId: modelTaskId,
    fingerprint: modelFingerprint,
    outputs: [docModelPath],
    force,
    statePath: syncStatePath,
  });

  if (!modelSync.skip) {
    runOrThrow('node', [
      '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/markdown_to_doc_model.mjs',
      '--markdown',
      markdownPath,
      '--component-name',
      componentName,
      '--out',
      docModelPath,
    ]);
    updateTaskState({
      taskId: modelTaskId,
      fingerprint: modelFingerprint,
      outputs: [docModelPath],
      metadata: {
        command: 'markdown_to_doc_model',
      },
      statePath: syncStatePath,
    });
  }

  const stepBArgs: string[] = [
    '.agents/skills/document-design-system/ds-markdown-to-figma-section/scripts/build_figma_execute_code.mjs',
    '--model',
    docModelPath,
    '--theme',
    themePath,
    '--component-name',
    componentName,
    '--offset-x',
    String(offsetX),
    '--out',
    executePath,
    '--payload-out',
    payloadPath,
  ];

  if (resolvedComponentSetId) {
    stepBArgs.push('--component-set-id', resolvedComponentSetId);
  }
  stepBArgs.push('--token-registry', tokenRegistryPath);

  const executeTaskId = `ds-markdown-to-figma:execute:${path.resolve(markdownPath)}`;
  const executeFingerprint = computeFingerprint({
    files: [
      docModelPath,
      themePath,
      modelToExecuteScriptPath,
      tokenRegistryPath,
    ],
    values: {
      componentName,
      componentSetId: resolvedComponentSetId,
      offsetX: String(offsetX),
      executePath: path.resolve(executePath),
      payloadPath: path.resolve(payloadPath),
    },
  });
  const executeSync = shouldSkipTask({
    taskId: executeTaskId,
    fingerprint: executeFingerprint,
    outputs: [executePath, payloadPath],
    force,
    statePath: syncStatePath,
  });

  if (!executeSync.skip) {
    runOrThrow('node', stepBArgs);
    updateTaskState({
      taskId: executeTaskId,
      fingerprint: executeFingerprint,
      outputs: [executePath, payloadPath],
      metadata: {
        command: 'build_figma_execute_code',
      },
      statePath: syncStatePath,
    });
  }

  const renderTaskId = `ds-markdown-to-figma:render:${path.resolve(markdownPath)}`;
  const renderFingerprint = computeFingerprint({
    files: [executePath, payloadPath],
    values: {
      componentName,
      componentSetId: resolvedComponentSetId,
      figmaUrl,
      offsetX: String(offsetX),
    },
  });
  const renderSync = shouldSkipTask({
    taskId: renderTaskId,
    fingerprint: renderFingerprint,
    outputs: [executePath, payloadPath],
    force,
    statePath: syncStatePath,
  });

  if (renderSync.skip) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: renderSync.reason,
          markdownPath,
          componentName,
          outputs: {
            docModelPath,
            executePath,
            payloadPath,
          },
          hint: 'Use --force true to regenerate and re-render in Figma.',
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  let renderExpectations: RenderExpectations;
  try {
    renderExpectations = readRenderExpectations({
      payloadPath,
      componentName,
    });
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const prompt = [
    'Context',
    '- Render markdown documentation into a Figma section using generated script artifacts.',
    '',
    'Sources',
    figmaUrl ? `- Figma URL (if connection needed): ${figmaUrl}` : '',
    `- Markdown source: ${markdownPath}`,
    `- Generated figma_execute script: ${path.resolve(executePath)}`,
    '',
    'Constraints',
    '- Read the generated figma_execute script from disk.',
    '- Execute that exact script with figma_execute (no reimplementation, no manual fallback rendering).',
    `- Keep section idempotent and place it ${String(offsetX)}px to the right of the component section.`,
    '- Do not alter unrelated components/sections.',
    '- Report unsupported markdown blocks if any.',
    '- Return exactly one JSON object and no prose.',
    '',
    'Expected Output',
    '- JSON keys: target_section_id, target_section_name, offset_x_applied, theme_name, unsupported_blocks_count, component_set_id, component_section_id, rendered_count.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const agentResponse: AgentExecutionResult = executeAgentPrompt({
      prompt,
      agent: agent as 'codex' | 'claude' | 'gemini' | 'auto',
      label: `active-md-to-figma-${fileBase}`,
    });
    const renderReport = parseRenderReportFromOutput(agentResponse.stdout);
    if (!renderReport) {
      const outputPath = path.resolve(generatedDir, `${fileBase}.render-agent-output.txt`);
      tempArtifacts.writeTrackedFile(outputPath, agentResponse.stdout, 'utf8');
      throw new Error(
        'Unable to parse render report JSON from agent output.\n' +
        `Expected keys: target_section_id, target_section_name, offset_x_applied, theme_name.\n` +
        `Saved raw agent output: ${outputPath}`,
      );
    }

    // Validate render report using agent-execution-phase service
    const reportValidation: RenderReportValidationResult = validateRenderReport({
      report: renderReport,
      expectedThemeName: expectedThemeName,
      expectedOffsetX: Number(offsetX),
      force,
    });

    if (!reportValidation.ok) {
      const outputPath = path.resolve(generatedDir, `${fileBase}.render-agent-output.txt`);
      tempArtifacts.writeTrackedFile(outputPath, agentResponse.stdout, 'utf8');
      throw new Error(
        'Render report validation failed.\n' +
        reportValidation.errors.map((issue) => `- ${issue}`).join('\n') +
        '\n' +
        `Saved raw agent output: ${outputPath}`,
      );
    }

    // Log warnings from validation
    for (const warning of reportValidation.warnings) {
      logger.warn(warning);
    }

    // Validate primary render report against expectations
    const primaryReportValidation = validatePrimaryRenderReport({
      renderReport,
      expectations: renderExpectations,
    });
    if (!primaryReportValidation.ok) {
      const outputPath = path.resolve(generatedDir, `${fileBase}.render-agent-output.txt`);
      tempArtifacts.writeTrackedFile(outputPath, agentResponse.stdout, 'utf8');
      throw new Error(
        'Render report failed strict primary validation.\n' +
        primaryReportValidation.issues.map((issue) => `- ${issue}`).join('\n') +
        '\n' +
        `Saved raw agent output: ${outputPath}`,
      );
    }

    // Execute render audit phase
    const auditResult: RenderAuditPhaseResult = executeRenderAuditPhase({
      figmaUrl,
      targetSectionId: String(renderReport.targetSectionId),
      targetSectionName: String(renderReport.targetSectionName),
      expectedSectionName: renderExpectations.expectedSectionName,
      expectedCardCount: renderExpectations.expectedCardCount,
      expectedTableCount: renderExpectations.expectedTableCount,
      agent: agent as 'codex' | 'claude' | 'gemini' | 'auto',
      fileBase,
      generatedDir,
      renderReport,
      expectations: renderExpectations,
    });

    if (!auditResult.ok) {
      throw new Error(
        'Render structure audit failed. Themed renderer output is inconsistent; fallback-like render blocked.\n' +
        (auditResult.errors?.map((issue) => `- ${issue}`).join('\n') || 'Unknown audit errors') +
        '\n' +
        `Saved raw audit output: ${auditResult.outputPath}`,
      );
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          markdownPath,
          target_section_id: renderReport.targetSectionId,
          target_section_name: renderReport.targetSectionName,
          offset_x_applied: renderReport.offsetXApplied,
          theme_name: renderReport.themeName,
          unsupported_blocks_count: renderReport.unsupportedBlocksCount,
        },
        null,
        2,
      )}\n`,
    );

    updateTaskState({
      taskId: renderTaskId,
      fingerprint: renderFingerprint,
      outputs: [executePath, payloadPath],
      metadata: {
        command: 'figma_execute_render',
        targetSectionId: renderReport.targetSectionId,
        targetSectionName: renderReport.targetSectionName,
        themeName: renderReport.themeName,
        unsupportedBlocksCount: renderReport.unsupportedBlocksCount,
        structureAudit: {
          hasDocCanvas: auditResult.auditReport.hasDocCanvas,
          cardCount: auditResult.auditReport.cardCount,
          tableContainerCount: auditResult.auditReport.tableContainerCount,
          headerRowCount: auditResult.auditReport.headerRowCount,
          bodyRowCount: auditResult.auditReport.bodyRowCount,
        },
      },
      statePath: syncStatePath,
    });

    // Execute visual proof capture phase
    const proofResult = executeVisualProofPhase({
      markdownPath,
      specPath,
      componentSetId: resolvedComponentSetId,
      agent: agent as 'codex' | 'claude' | 'gemini' | 'auto',
      system: args.system,
      figmaUrl: figmaUrl,
      captureProofStrict: captureProofStrict,
    });

    if (proofResult.skipped) {
      logger.warn(proofResult.skipReason);
    } else if (!proofResult.ok) {
      logger.warn(proofResult.error);
    }

    syncDocumentationIndices({
      docsDir: ctx.paths.docs,
      overviewPath: path.join(ctx.paths.docs, 'overview.md'),
      specsDir: ctx.paths.specs,
      proofsDir: path.join(ctx.paths.generated, 'visual-proofs'),
      renderDir: path.join(ctx.paths.generated, 'figma_doc_models'),
      registryPath: ctx.paths.registry,
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

// CLI entry point
if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args) as ActiveMdToFigmaArgs;
  runActiveMdToFigma(parsed).catch((error) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
