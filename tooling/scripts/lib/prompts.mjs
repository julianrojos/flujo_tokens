import {
  CANONICAL_H2_ORDER,
  REQUIRED_CANONICAL_H2,
  OPTIONAL_CANONICAL_H2,
} from "./docs-config.mjs";

export const RULE_BLOCKS = Object.freeze({
  FIGMA_MCP_WORKFLOW:
    "Use figma MCP workflow and inspect the referenced component/set.",
  DOCUMENTATION_ONLY:
    "Documentation only. Do not generate component implementation code.",
  NO_INVENTION:
    "Do not invent properties, variants, states, accessibility, or token semantics.",
  NO_INTERNAL_IDS:
    "Never use Figma internal variable IDs (VariableID) in user-facing prose/tables.",
  NO_VARIABLE_IDS:
    "Never use Figma internal variable IDs (VariableID) in generated content.",
  GAPS_AUTOMANAGED:
    "`## Gaps / TBD` is auto-managed by the pipeline and should not contain custom freeform entries.",
});

function sanitizePromptValue(value) {
  return String(value ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizePromptLine(line) {
  const value = sanitizePromptValue(line);
  if (!value) return "";
  return value.replace(/^-+\s*/, "");
}

function renderSection(title, lines) {
  const normalized = (Array.isArray(lines) ? lines : [])
    .map((line) => normalizePromptLine(line))
    .filter(Boolean);
  if (normalized.length === 0) return [];
  return [title, ...normalized.map((line) => `- ${line}`), ""];
}

export function canonicalH2ConstraintLines() {
  return [
    "Use only canonical H2 sections in exact canonical order.",
    `Canonical H2 sequence: ${CANONICAL_H2_ORDER.join(" -> ")}.`,
    `Required H2 order: ${REQUIRED_CANONICAL_H2.join(" -> ")}.`,
    `Optional H2 (include only when applicable, still canonical order): ${OPTIONAL_CANONICAL_H2.join(
      " -> ",
    )}.`,
    "Do not create extra H2 headings outside the canonical set.",
  ];
}

export function buildAgentPrompt({
  context = [],
  sources = [],
  constraints = [],
  examples = [],
  expectedOutput = [],
} = {}) {
  const sections = [
    ...renderSection("Context", context),
    ...renderSection("Sources", sources),
    ...renderSection("Constraints", constraints),
    ...renderSection("Examples", examples),
    ...renderSection("Expected Output", expectedOutput),
  ];

  const trimmed = sections.slice();
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  return trimmed.join("\n");
}
