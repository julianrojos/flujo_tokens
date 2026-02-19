import fs from "node:fs";
import path from "node:path";

const STYLE_REFERENCE_FILE = "_style_reference.md";
const OVERVIEW_FILE = "overview.md";

export function resolveStyleReferencePath({ componentDocsDir, outputPath }) {
  const docsDir = path.resolve(String(componentDocsDir || ""));
  if (!docsDir || !fs.existsSync(docsDir)) return "";

  const outputBaseName = outputPath ? path.basename(String(outputPath)) : "";
  const candidates = fs
    .readdirSync(docsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".md") && name !== OVERVIEW_FILE)
    .sort((a, b) => a.localeCompare(b, "en"));

  if (candidates.length === 0) return "";

  if (candidates.includes(STYLE_REFERENCE_FILE)) {
    return path.resolve(path.join(docsDir, STYLE_REFERENCE_FILE));
  }

  const nonTargetCandidate = candidates.find((name) => name !== outputBaseName);
  const selected = nonTargetCandidate || candidates.find((name) => name === outputBaseName) || "";
  return selected ? path.resolve(path.join(docsDir, selected)) : "";
}
