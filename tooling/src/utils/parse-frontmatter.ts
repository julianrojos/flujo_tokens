/**
 * Parse YAML utilities.
 *
 * Note: Depends on js-yaml from root package.json dependencies.
 * If tooling/src/ is extracted to a separate package, js-yaml
 * should be declared as a direct dependency.
 */
import yaml from "js-yaml";

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
