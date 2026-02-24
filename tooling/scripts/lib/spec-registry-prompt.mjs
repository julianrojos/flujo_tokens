import { buildSpecPrompt } from "./spec-agent-runner.mjs";
import { buildTokenMenuLines, extractUniqueRegistryEntries } from "./spec-token-mapping.mjs";

export function loadRegistryOrThrow({ loadTokenRegistryFn, registryPath }) {
  try {
    return loadTokenRegistryFn(registryPath);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}. Run \`npm run generate:registry\` first.`,
    );
  }
}

export function buildSpecPromptWithRegistry({
  figmaUrl,
  nodeId,
  componentName,
  componentSlug,
  outputPath,
  templatePath,
  registryPath,
  fileKeyFromUrl,
  registryIndex,
}) {
  return buildSpecPrompt({
    figmaUrl,
    nodeId,
    componentName,
    outputPath,
    templatePath,
    registryPath,
    fileKeyFromUrl,
    tokenMenuLines: buildTokenMenuLines(
      extractUniqueRegistryEntries(registryIndex),
      componentName || componentSlug,
    ),
  });
}
