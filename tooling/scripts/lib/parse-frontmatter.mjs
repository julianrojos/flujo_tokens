/**
 * Parse YAML utilities.
 *
 * Note: Depends on js-yaml from root package.json dependencies.
 * If tooling/src/ is extracted to a separate package, js-yaml
 * should be declared as a direct dependency.
 */
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
