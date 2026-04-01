/**
 * Spec Agent Runner
 *
 * Builds and executes prompts for spec generation from Figma.
 * Wraps agent-runner with spec-specific prompt construction and validation.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECT_ROOT } from '../utils/system-context.js';
import { componentNameToSnakeCase } from '../utils/component-name.js';
import { runAgentPrompt, type AgentType, type AgentPromptResult } from './agent-runner.js';
import { SPEC_TOP_LEVEL_ORDER } from './spec-normalizer.js';

// Constants (template path)
export const GOLDEN_COMPONENT_SPEC_SAMPLE_PATH = path.resolve(
  PROJECT_ROOT,
  'tooling/templates/component-spec/_template.yml',
);

export const SPEC_REQUIRED_TOP_LEVEL_FIELDS = [
  'name',
  'status',
  'figma',
  'summary',
  'anatomy',
  'properties',
  'content_guidelines',
  'best_practices',
  'accessibility',
  'token_mapping',
  'qa',
];

// SPEC_TOP_LEVEL_ORDER is imported from spec-normalizer.js

export const RULE_BLOCKS = Object.freeze({
  FIGMA_MCP_WORKFLOW:
    'Use figma MCP workflow and inspect the referenced component/set.',
  DOCUMENTATION_ONLY:
    'Documentation only. Do not generate component implementation code.',
  NO_INVENTION:
    'Do not invent properties, variants, states, accessibility, or token semantics.',
  NO_INTERNAL_IDS:
    'Never use Figma internal variable IDs (VariableID) in user-facing prose/tables.',
  NO_VARIABLE_IDS:
    'Never use Figma internal variable IDs (VariableID) in generated content.',
  GAPS_AUTOMANAGED:
    '`## Gaps / TBD` is auto-managed by the pipeline and should not contain custom freeform entries.',
});

/**
 * Build prompt options for spec generation.
 */
export interface BuildSpecPromptOptions {
  figmaUrl?: string;
  nodeId?: string;
  componentName?: string;
  outputPath: string;
  templatePath: string;
  registryPath: string;
  fileKeyFromUrl?: string;
  tokenMenuLines: string[];
}

/**
 * Build agent prompt for spec generation from Figma.
 */
export function buildSpecPrompt(options: BuildSpecPromptOptions): string {
  const {
    figmaUrl,
    nodeId,
    componentName,
    outputPath,
    templatePath,
    registryPath,
    fileKeyFromUrl,
    tokenMenuLines,
  } = options;

  const contextParts = [
    'Generate one component spec YAML from Figma for this repository\'s documentation pipeline.',
    componentName ? `Expected component name: ${componentName}` : '',
    nodeId ? `Target component set node id: ${nodeId}` : '',
    fileKeyFromUrl ? `Figma file key from URL: ${fileKeyFromUrl}` : '',
  ].filter(Boolean);

  const sourceParts = [
    figmaUrl
      ? `Figma URL: ${figmaUrl}`
      : 'Figma URL: not provided (use node id or name lookup).',
    `Spec template: ${templatePath}`,
    `Token registry: ${registryPath}`,
    `Golden spec example for structure/detail: ${GOLDEN_COMPONENT_SPEC_SAMPLE_PATH}`,
    ...(tokenMenuLines.length > 0
      ? [
        'Token menu (prefer these exact paths when applicable):',
        ...tokenMenuLines,
      ]
      : []),
    'Existing spec reference: <active-system-docs>/docs/_spec/components/alert.yml',
    `Output path (required): ${outputPath}`,
  ];

  const constraintParts = [
    RULE_BLOCKS.FIGMA_MCP_WORKFLOW,
    'Write YAML only (no markdown, no code fences).',
    `Include required top-level fields: ${SPEC_REQUIRED_TOP_LEVEL_FIELDS.join(', ')}.`,
    `Top-level YAML key order must be: ${SPEC_TOP_LEVEL_ORDER.join(' -> ')}.`,
    'Set figma.file, figma.page, figma.component_set from evidence.',
    'Set figma.component_set_node_id when node-id is available from URL/context.',
    'In token_mapping, use token paths that exist in the token registry.',
    'Prefer token paths from the provided token menu before proposing any other registry path.',
    'If the output spec already exists, keep existing non-TBD values unless Figma evidence explicitly proves they are wrong, incomplete, outdated, or missing.',
    'If a field is not inferable, set it to `TBD` instead of guessing.',
    RULE_BLOCKS.NO_VARIABLE_IDS,
    'Keep language in English and concise.',
  ];

  const expectedOutputParts = [
    'Write/update exactly one file at the output path.',
    'Return a short report: output path, component name, unresolved TBD count.',
  ];

  return [
    'Context',
    ...contextParts,
    '',
    'Sources',
    ...sourceParts,
    '',
    'Constraints',
    ...constraintParts,
    '',
    'Expected Output',
    ...expectedOutputParts,
  ].join('\n');
}

/**
 * Build validation feedback prompt for spec repair.
 */
export interface BuildSpecValidationFeedbackPromptOptions {
  basePrompt: string;
  outputPath: string;
  validationErrors: unknown[];
}

export function buildSpecValidationFeedbackPrompt(
  options: BuildSpecValidationFeedbackPromptOptions,
): string {
  const { basePrompt, outputPath, validationErrors } = options;

  return (
    `${basePrompt}\n\n` +
    'Validation Feedback\n' +
    `- The generated spec at \`${outputPath}\` failed validation.\n` +
    '- Fix the same output file in place.\n' +
    '- Keep required top-level fields and canonical key order.\n' +
    '- Validation errors (JSON):\n' +
    `${JSON.stringify(validationErrors, null, 2)}\n`
  );
}

/**
 * Build agent label for prompt fallback file naming.
 */
export interface BuildSpecAgentLabelOptions {
  kind: 'generate' | 'repair';
  componentName?: string;
  nodeId?: string;
}

export function buildSpecAgentLabel(options: BuildSpecAgentLabelOptions): string {
  const { kind, componentName, nodeId } = options;
  const suffix = componentNameToSnakeCase(componentName || nodeId || 'component');
  if (kind === 'repair') return `spec-from-figma-repair-${suffix}`;
  return `spec-from-figma-${suffix}`;
}

/**
 * Run spec generation prompt via agent.
 */
export interface RunSpecGenerationPromptOptions {
  prompt: string;
  agent?: AgentType;
  componentName?: string;
  nodeId?: string;
}

export function runSpecGenerationPrompt(
  options: RunSpecGenerationPromptOptions,
): AgentPromptResult {
  const { prompt, agent, componentName, nodeId } = options;

  return runAgentPrompt({
    prompt,
    agent,
    label: buildSpecAgentLabel({ kind: 'generate', componentName, nodeId }),
  });
}

/**
 * Run spec repair prompt via agent.
 */
export interface RunSpecRepairPromptOptions {
  prompt: string;
  agent?: AgentType;
  componentName?: string;
  nodeId?: string;
}

export function runSpecRepairPrompt(
  options: RunSpecRepairPromptOptions,
): AgentPromptResult {
  const { prompt, agent, componentName, nodeId } = options;

  return runAgentPrompt({
    prompt,
    agent,
    label: buildSpecAgentLabel({ kind: 'repair', componentName, nodeId }),
  });
}
