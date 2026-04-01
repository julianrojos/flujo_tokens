import { runAgentPrompt } from "./agent-runner.mjs";
import { componentNameToSnakeCase } from "./component-name.mjs";
import { GOLDEN_COMPONENT_SPEC_SAMPLE_PATH } from "./doc-templates.mjs";
import { SPEC_REQUIRED_TOP_LEVEL_FIELDS } from "./docs-config.mjs";
import { buildAgentPrompt, RULE_BLOCKS } from "./prompts.mjs";
import { SPEC_TOP_LEVEL_ORDER } from "./spec-normalizer.mjs";

export function buildSpecPrompt({
  figmaUrl,
  nodeId,
  componentName,
  outputPath,
  templatePath,
  registryPath,
  fileKeyFromUrl,
  tokenMenuLines,
}) {
  return buildAgentPrompt({
    context: [
      "Generate one component spec YAML from Figma for this repository's documentation pipeline.",
      componentName ? `Expected component name: ${componentName}` : "",
      nodeId ? `Target component set node id: ${nodeId}` : "",
      fileKeyFromUrl ? `Figma file key from URL: ${fileKeyFromUrl}` : "",
    ],
    sources: [
      figmaUrl
        ? `Figma URL: ${figmaUrl}`
        : "Figma URL: not provided (use node id or name lookup).",
      `Spec template: ${templatePath}`,
      `Token registry: ${registryPath}`,
      `Golden spec example for structure/detail: ${GOLDEN_COMPONENT_SPEC_SAMPLE_PATH}`,
      ...(tokenMenuLines.length > 0
        ? [
            "Token menu (prefer these exact paths when applicable):",
            ...tokenMenuLines,
          ]
        : []),
      "Existing spec reference: <active-system-docs>/docs/_spec/components/alert.yml",
      `Output path (required): ${outputPath}`,
    ],
    constraints: [
      RULE_BLOCKS.FIGMA_MCP_WORKFLOW,
      "Write YAML only (no markdown, no code fences).",
      `Include required top-level fields: ${SPEC_REQUIRED_TOP_LEVEL_FIELDS.join(", ")}.`,
      `Top-level YAML key order must be: ${SPEC_TOP_LEVEL_ORDER.join(" -> ")}.`,
      "Set figma.file, figma.page, figma.component_set from evidence.",
      "Set figma.component_set_node_id when node-id is available from URL/context.",
      "In token_mapping, use token paths that exist in the token registry.",
      "Prefer token paths from the provided token menu before proposing any other registry path.",
      "If the output spec already exists, keep existing non-TBD values unless Figma evidence explicitly proves they are wrong, incomplete, outdated, or missing.",
      "If a field is not inferable, set it to `TBD` instead of guessing.",
      RULE_BLOCKS.NO_VARIABLE_IDS,
      "Keep language in English and concise.",
    ],
    expectedOutput: [
      "Write/update exactly one file at the output path.",
      "Return a short report: output path, component name, unresolved TBD count.",
    ],
  });
}

export function buildSpecValidationFeedbackPrompt({
  basePrompt,
  outputPath,
  validationErrors,
}) {
  return (
    `${basePrompt}\n\n` +
    "Validation Feedback\n" +
    `- The generated spec at \`${outputPath}\` failed validation.\n` +
    "- Fix the same output file in place.\n" +
    "- Keep required top-level fields and canonical key order.\n" +
    "- Validation errors (JSON):\n" +
    `${JSON.stringify(validationErrors, null, 2)}\n`
  );
}

export function buildSpecAgentLabel({ kind, componentName, nodeId }) {
  const suffix = componentNameToSnakeCase(componentName || nodeId || "component");
  if (kind === "repair") return `spec-from-figma-repair-${suffix}`;
  return `spec-from-figma-${suffix}`;
}

export function runSpecGenerationPrompt({ prompt, agent, componentName, nodeId }) {
  runAgentPrompt({
    prompt,
    agent,
    label: buildSpecAgentLabel({ kind: "generate", componentName, nodeId }),
  });
}

export function runSpecRepairPrompt({ prompt, agent, componentName, nodeId }) {
  runAgentPrompt({
    prompt,
    agent,
    label: buildSpecAgentLabel({ kind: "repair", componentName, nodeId }),
  });
}
