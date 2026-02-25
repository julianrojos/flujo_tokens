import yaml from "js-yaml";

function stripMarkdownFences(text) {
  const match = String(text || "").match(/^```(?:yaml|yml)?\s*([\s\S]*?)\s*```$/i);
  if (match) return match[1].trim();
  return String(text || "").trim();
}

export function parseYamlResponse(rawText) {
  const cleanedText = stripMarkdownFences(rawText);
  try {
    const parsed = yaml.load(cleanedText);
    return {
      ok: true,
      data: parsed,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
