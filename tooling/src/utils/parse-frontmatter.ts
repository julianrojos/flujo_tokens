/**
 * Parse YAML and markdown frontmatter utilities.
 * 
 * Note: Depends on js-yaml from root package.json dependencies.
 * If tooling/src/ is extracted to a separate package, js-yaml
 * should be declared as a direct dependency.
 */
import yaml from "js-yaml";

export interface ParsedFrontmatter<T = unknown> {
  frontmatter: T;
  content: string;
}

/**
 * Parse a YAML document string into an object.
 */
export function parseYamlDocument<T = unknown>(
  rawYaml: string,
  sourceLabel = "YAML document"
): T {
  let parsed: unknown;
  try {
    parsed = yaml.load(rawYaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${sourceLabel}: ${message}`);
  }

  if (parsed == null) return {} as T;
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must parse to an object at top level.`);
  }
  return parsed as T;
}

/**
 * Parse markdown frontmatter from a markdown string.
 * Returns the parsed frontmatter object and the remaining content.
 */
export function parseMarkdownFrontmatter<T = Record<string, unknown>>(markdown: string): ParsedFrontmatter<T> {
  const normalized = String(markdown).replace(/\r\n/g, "\n");
  
  if (!normalized.startsWith("---\n")) {
    return {
      frontmatter: {} as T,
      content: normalized,
    };
  }

  const lines = normalized.split("\n");
  let endIndex = -1;
  
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return {
      frontmatter: {} as T,
      content: normalized,
    };
  }

  const frontmatterRaw = lines.slice(1, endIndex).join("\n");
  const content = lines.slice(endIndex + 1).join("\n");
  
  return {
    frontmatter: parseYamlDocument(frontmatterRaw, "markdown frontmatter"),
    content,
  };
}
