import yaml from "js-yaml";

export function parseYamlDocument(rawYaml, sourceLabel = "YAML document") {
  let parsed;
  try {
    parsed = yaml.load(rawYaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${sourceLabel}: ${message}`);
  }

  if (parsed == null) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must parse to an object at top level.`);
  }
  return parsed;
}

export function parseMarkdownFrontmatter(markdown) {
  const normalized = String(markdown).replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return {
      frontmatter: {},
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
      frontmatter: {},
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
