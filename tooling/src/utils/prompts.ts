/**
 * Prompts Utilities
 *
 * Provides prompt building utilities for agent interactions.
 * Migrated from tooling/scripts/lib/prompts.mjs
 */
import {
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
  OPTIONAL_CANONICAL_H2,
} from './docs-config.js';

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
 * Sanitize prompt value for safe inclusion in prompts.
 */
function sanitizePromptValue(value: unknown): string {
  return String(value ?? '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Normalize a prompt line by removing leading dashes and whitespace.
 */
function normalizePromptLine(line: string): string {
  const value = sanitizePromptValue(line);
  if (!value) return '';
  return value.replace(/^-+\s*/, '');
}

/**
 * Render a section with title and bullet points.
 */
function renderSection(title: string, lines: string[]): string[] {
  const normalized = (Array.isArray(lines) ? lines : [])
    .map((line) => normalizePromptLine(line))
    .filter(Boolean);
  if (normalized.length === 0) return [];
  return [title, ...normalized.map((line) => `- ${line}`), ''];
}

export interface BuildAgentPromptOptions {
  context?: string[];
  sources?: string[];
  constraints?: string[];
  examples?: string[];
  expectedOutput?: string[];
  spec?: string[];
}

/**
 * Build an agent prompt from sections.
 */
export function buildAgentPrompt(
  options: BuildAgentPromptOptions = {}
): string {
  const {
    context = [],
    sources = [],
    constraints = [],
    examples = [],
    expectedOutput = [],
    spec = [],
  } = options;

  const sections = [
    ...renderSection('Context', context),
    ...renderSection('Sources', sources),
    ...renderSection('Constraints', constraints),
    ...renderSection('Examples', examples),
    ...renderSection('Expected Output', expectedOutput),
    ...renderSection('Spec', spec),
  ];

  const trimmed = sections.slice();
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
    trimmed.pop();
  }
  return trimmed.join('\n');
}

/**
 * Get canonical H2 constraint lines for prompts.
 */
export function canonicalH2ConstraintLines(): string[] {
  return [
    'Use only canonical H2 sections in exact canonical order.',
    `Canonical H2 sequence: ${CANONICAL_H2_ORDER.join(' -> ')}.`,
    `Required H2 order: ${REQUIRED_CANONICAL_H2.join(' -> ')}.`,
    `Optional H2 (include only when applicable, still canonical order): ${OPTIONAL_CANONICAL_H2.join(
      ' -> '
    )}.`,
    'Do not create extra H2 headings outside the canonical set.',
  ];
}
