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
import { runAgentPrompt, type AgentType } from '../services/agent-runner.js';
import { validateDocs } from '../services/docs-validator.js';
import { parseMarkdownFrontmatter, parseYamlDocument } from '../utils/parse-frontmatter.js';
import { loadTokenRegistry } from '../services/token-registry.js';
import { extractGapsFromSpec } from '../services/gaps.js';
import { isPlainObject } from '../utils/is-plain-object.js';
import { deriveFigmaFrontmatterTraceability } from '../services/figma-traceability.js';
import { normalizeAgentOutput } from '../services/agent-output-normalizer.js';
import { GOLDEN_COMPONENT_DOC_SAMPLE_PATH, writeComponentDocSkeleton } from '../utils/doc-templates.js';
import { validateAgentOutputContract, writeAgentOutputErrorReport } from '../utils/agent-output-contract.js';
import { updateAgentDriftBaseline } from '../services/agent-drift-detector.js';
import { buildAgentPrompt, canonicalH2ConstraintLines, RULE_BLOCKS } from '../utils/prompts.js';
import { normalizeComponentName, componentNameFromFilePath, componentNameToSnakeCase } from '../utils/component-name.js';
import { computeFingerprint, shouldSkipTask, updateTaskState } from '../services/cache-utils.js';
import type { SkipTaskResult } from '../types/cache-utils.js';
import { TRACEABILITY_CONTRACT_VERSION } from '../utils/docs-config.js';
import { captureFileSnapshot, restoreFileSnapshot } from '../services/file-snapshot.js';
import { assertDocStatusStable, assertEvidenceGatedScalarChanges } from '../services/evidence-gated-mutations.js';
import { assertScopedWritePolicy, captureScopedWriteSnapshot } from '../services/scoped-write-guard.js';
import { syncDocumentationState } from '../services/component-registry-index.js';
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

  const ctx = resolveSystemContextSafe({ system: typeof parsed.system === 'string' ? parsed.system : undefined });
  const parsedArgs = parsed as Record<string, string | boolean>;
  const componentName = String(parsedArgs['component-name'] || '').trim();
  const specFile = parsedArgs['spec-file'] && typeof parsedArgs['spec-file'] === 'string'
    ? path.resolve(parsedArgs['spec-file'])
    : undefined;
  const outputFile = parsedArgs.output && typeof parsedArgs.output === 'string'
    ? path.resolve(parsedArgs.output)
    : undefined;
  
  // Resolve registry path with explicit validation
  const parsedRegistry = typeof parsedArgs.registry === 'string' ? parsedArgs.registry : undefined;
  const ctxRegistry = ctx.paths.tokenRegistry;
  const registryPath = parsedRegistry 
    ? path.resolve(parsedRegistry)
    : ctxRegistry 
      ? path.resolve(ctxRegistry)
      : path.resolve(ctx.paths.docs, '_generated', 'token-registry.json');
  
  const agent = String(parsedArgs.agent || 'auto').trim();
  const force = parseBooleanOption(parsedArgs.force, false);
  const skipValidation = parseBooleanOption(parsedArgs['skip-validation'], false);
  const dryRun = parseBooleanOption(parsedArgs['dry-run'], false);

  // Resolve paths - ctx.paths.docs already points to <docsDir>/components per system-context.ts
  const docsDir = ctx.paths.docs;
  const specsDir = ctx.paths.specs;

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
  const sync: SkipTaskResult = shouldSkipTask({
    taskId,
    fingerprint,
    outputs: [resolvedOutputFile],
    force,
  });

  if (sync.skip && !force) {
    const skipPayload = {
      ok: true,
      skipped: true,
      reason: sync.reason,
      component: componentName || resolvedSpecFile,
    };
    console.log(JSON.stringify(skipPayload, null, 2));
    return;
  }

  // Build agent prompt
  const prompt = await buildAgentPrompt({
    spec: [JSON.stringify(spec)],
    context: [JSON.stringify(tokenRegistry)],
    constraints: Object.values(RULE_BLOCKS),
    examples: [GOLDEN_COMPONENT_DOC_SAMPLE_PATH],
  });

  // Run agent
  const agentResult = await runAgentPrompt({
    prompt,
    agent: agent as AgentType | 'auto' | undefined,
  });

  // Normalize agent output with guard for undefined stdout
  const normalizedOutput = normalizeAgentOutput(agentResult.stdout ?? '');
  if (!normalizedOutput.trim()) {
    logger.error('Agent produced empty output. Check agent configuration and prompt.');
    process.exit(1);
  }

  // Validate agent output contract
  const contractResult = validateAgentOutputContract({ markdown: normalizedOutput });
  const contractOk = contractResult.errors.length === 0;

  if (!contractOk) {
    writeAgentOutputErrorReport({
      errors: contractResult.errors,
      outputPath: resolvedOutputFile,
      componentSlug: componentName ? componentNameToSnakeCase(componentName) : undefined,
      markdownPath: resolvedOutputFile,
      scriptName: 'component-doc-runner',
      rawOutput: normalizedOutput,
    });
    if (!dryRun) {
      updateAgentDriftBaseline({
        markdownPath: resolvedOutputFile,
        componentSlug: componentName ? componentNameToSnakeCase(componentName) : undefined,
        scriptName: 'component-doc-runner',
      });
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
    const metadata = { agent, component: componentName || resolvedSpecFile };
    updateTaskState({
      taskId,
      fingerprint,
      outputs: [resolvedOutputFile],
      metadata,
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
    syncDocumentationState({
      dbPath: ctx.paths.registry,
      overviewPath: path.join(ctx.paths.docs, 'overview.md'),
      specsDir: ctx.paths.specs,
      docsDir: ctx.paths.docs,
      dryRun: false,
      systemId: ctx.id,
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
    logger.error(`Component doc runner failed: ${error}`);
    process.exit(1);
  });
}
