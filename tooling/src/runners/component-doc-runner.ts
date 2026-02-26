#!/usr/bin/env node

/**
 * Component Doc Runner
 *
 * Generates or updates one component markdown from a component spec YAML.
 * Uses AI agent to generate documentation content.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

import { parseArgs, printUsage } from '../utils/parse-args.js';
import { resolveSystemContextSafe } from '../utils/system-context.js';
import { logger } from '../utils/logger.js';

// Import from existing libs during migration
import { runAgentPrompt } from '../services/agent-runner.js';
import { validateDocs } from '../../scripts/lib/docs-validator.mjs';
import { parseMarkdownFrontmatter, parseYamlDocument } from '../../scripts/lib/parse-frontmatter.mjs';
import { loadTokenRegistry } from '../services/token-registry.js';
import { extractGapsFromSpec, upsertGapsSection } from '../../scripts/lib/gaps.mjs';
import { isPlainObject } from '../../scripts/lib/is-plain-object.mjs';
import { deriveFigmaFrontmatterTraceability } from '../../scripts/lib/figma-traceability.mjs';
import { normalizeAgentOutputFile } from '../../scripts/lib/agent-output-normalizer.mjs';
import { GOLDEN_COMPONENT_DOC_SAMPLE_PATH, writeComponentDocSkeleton } from '../../scripts/lib/doc-templates.mjs';
import { validateAgentOutputContract, writeAgentOutputErrorReport } from '../../scripts/lib/agent-output-contract.mjs';
import { updateAgentDriftBaseline } from '../../scripts/lib/agent-drift-detector.mjs';
import { buildAgentPrompt, canonicalH2ConstraintLines, RULE_BLOCKS } from '../../scripts/lib/prompts.mjs';
import { formatMarkdownTarget } from '../../scripts/lib/format-markdown.mjs';
import { normalizeComponentName, componentNameFromFilePath, componentNameToSnakeCase } from '../../scripts/lib/component-name.mjs';
import { computeFingerprint, shouldSkipTask, updateTaskState } from '../services/cache-utils.js';
import { TRACEABILITY_CONTRACT_VERSION } from '../../scripts/lib/docs-config.mjs';
import { captureFileSnapshot, restoreFileSnapshot } from '../services/file-snapshot.js';
import { assertDocStatusStable, assertEvidenceGatedScalarChanges } from '../../scripts/lib/evidence-gated-mutations.mjs';
import { assertScopedWritePolicy, captureScopedWriteSnapshot } from '../../scripts/lib/scoped-write-guard.mjs';
import { syncDocumentationIndices } from '../services/component-registry-index.js';
import { TempArtifactManager } from '../services/temp-artifacts.js';

const USAGE = {
  command: 'npm run ds:component-doc -- --component-name Alert [--agent codex] [--output docs/components/alert.md]',
  description: 'Generate or update one component markdown from a component spec YAML.',
  options: [
    {
      name: '--component-name',
      description: 'Display component name (PascalCase). Used to infer spec/output paths.',
    },
    {
      name: '--spec-file',
      description: 'Explicit spec YAML path.',
    },
    {
      name: '--output',
      description: 'Explicit markdown output path.',
    },
    {
      name: '--registry',
      description: 'Token registry JSON path.',
      defaultValue: 'docs/_generated/token-registry.json',
    },
    {
      name: '--agent',
      description: 'Agent CLI used for generation.',
      defaultValue: 'auto',
    },
    {
      name: '--force',
      description: 'Bypass incremental cache.',
      defaultValue: 'false',
    },
    {
      name: '--skip-validation',
      description: 'Skip validate:docs after generation.',
      defaultValue: 'false',
    },
    {
      name: '--dry-run',
      description: 'Generate but do not write files.',
      defaultValue: 'false',
    },
    {
      name: '--help',
      description: 'Show this help message.',
    },
  ],
};

function parseBooleanOption(rawValue: unknown, fallback: boolean): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid boolean value: ${rawValue}`);
}

export async function runComponentDoc(args: string[] = []): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printUsage(USAGE);
    process.exit(0);
  }

  const ctx = resolveSystemContextSafe({ system: parsed.system });
  const componentName = String(parsed['component-name'] || '').trim();
  const specFile = parsed['spec-file'] ? path.resolve(String(parsed['spec-file'])) : undefined;
  const outputFile = parsed.output ? path.resolve(String(parsed.output)) : undefined;
  const registryPath = path.resolve(String(parsed.registry || ctx.paths.tokenRegistry));
  const agent = String(parsed.agent || 'auto').trim();
  const force = parseBooleanOption(parsed.force, false);
  const skipValidation = parseBooleanOption(parsed['skip-validation'], false);
  const dryRun = parseBooleanOption(parsed['dry-run'], false);

  // Resolve paths
  const specsDir = ctx.paths.specs;
  const docsDir = path.join(ctx.paths.docs, 'components');

  // Infer spec file path if not provided
  let resolvedSpecFile: string;
  if (specFile) {
    resolvedSpecFile = specFile;
  } else if (componentName) {
    const slug = componentNameToSnakeCase(componentName);
    resolvedSpecFile = path.join(specsDir, `${slug}.yml`);
  } else {
    console.error('Either --component-name or --spec-file is required.');
    printUsage(USAGE);
    process.exit(1);
  }

  // Infer output file path if not provided
  let resolvedOutputFile: string;
  if (outputFile) {
    resolvedOutputFile = outputFile;
  } else if (componentName) {
    const slug = componentNameToSnakeCase(componentName);
    resolvedOutputFile = path.join(docsDir, `${slug}.md`);
  } else {
    const specSlug = path.basename(resolvedSpecFile, '.yml');
    resolvedOutputFile = path.join(docsDir, `${specSlug}.md`);
  }

  // Validate spec exists
  if (!fs.existsSync(resolvedSpecFile)) {
    console.error(`Spec file not found: ${resolvedSpecFile}`);
    process.exit(1);
  }

  // Load spec
  const specContent = fs.readFileSync(resolvedSpecFile, 'utf8');
  const spec = parseYamlDocument(specContent, 'component spec');

  // Load token registry
  const tokenRegistry = loadTokenRegistry(registryPath);

  // Check cache (skip if unchanged)
  const fingerprint = computeFingerprint({
    files: [resolvedSpecFile, registryPath],
    values: { agent, version: '1.0.0' },
  });

  const taskId = `ds-component-doc:${resolvedSpecFile}`;
  const sync = shouldSkipTask({
    taskId,
    fingerprint,
    outputs: [resolvedOutputFile],
    force,
  });

  if (sync.skip && !force) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: sync.reason,
      component: componentName || resolvedSpecFile,
    }, null, 2));
    return;
  }

  // Build agent prompt
  const prompt = await buildAgentPrompt({
    spec,
    tokenRegistry,
    componentName,
    rules: RULE_BLOCKS,
    canonicalH2s: canonicalH2ConstraintLines,
    goldenSample: GOLDEN_COMPONENT_DOC_SAMPLE_PATH,
  });

  // Run agent
  const agentResult = await runAgentPrompt({
    prompt,
    agent,
    dryRun,
  });

  // Normalize agent output
  const normalizedOutput = normalizeAgentOutputFile(agentResult.output);

  // Validate agent output contract
  const contractResult = validateAgentOutputContract(normalizedOutput, {
    componentName,
    spec,
  });

  if (!contractResult.ok) {
    writeAgentOutputErrorReport(contractResult.errors);
    if (!dryRun) {
      updateAgentDriftBaseline({ component: componentName || resolvedSpecFile, errors: contractResult.errors });
    }
    process.exit(1);
  }

  // Write output (or preview)
  if (dryRun) {
    console.log('[dry-run] Generated markdown:');
    console.log(normalizedOutput);
  } else {
    fs.mkdirSync(path.dirname(resolvedOutputFile), { recursive: true });
    fs.writeFileSync(resolvedOutputFile, normalizedOutput, 'utf8');
  }

  // Update cache state
  if (!dryRun) {
    updateTaskState({
      taskId,
      fingerprint,
      outputs: [resolvedOutputFile],
      metadata: { agent, component: componentName || resolvedSpecFile },
    });
  }

  // Validate docs (if not skipped)
  if (!skipValidation && !dryRun) {
    const validation = validateDocs({
      docsRoot: docsDir,
      specRoot: specsDir,
      registryPath,
    });

    if (!validation.ok) {
      console.error('validate:docs failed:', validation.errors.slice(0, 5));
      process.exit(1);
    }
  }

  // Sync documentation indices
  if (!dryRun) {
    syncDocumentationIndices({
      registryPath: ctx.paths.registry,
      overviewPath: path.join(docsDir, 'overview.md'),
      specsDir,
      docsDir,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun,
    component: componentName || resolvedSpecFile,
    spec: resolvedSpecFile,
    output: resolvedOutputFile,
    agent,
  }, null, 2));
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  runComponentDoc(process.argv.slice(2)).catch((error) => {
    logger.error('Component doc runner failed:', error);
    process.exit(1);
  });
}
