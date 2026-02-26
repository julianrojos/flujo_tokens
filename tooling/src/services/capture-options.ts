/**
 * Capture Options Parser
 *
 * Parses and validates command-line options for capture workflows.
 */

/**
 * Parse a boolean option from string value.
 *
 * @param rawValue - Raw string value from CLI.
 * @param optionName - Option name for error messages.
 * @param fallback - Default value if not provided.
 * @returns Parsed boolean.
 * @throws Error if value is not 'true' or 'false'.
 */
export function parseBooleanOption(
  rawValue: string | undefined,
  optionName: string,
  fallback = false,
): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(
    `Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`,
  );
}

/**
 * Parse a positive number from string value.
 *
 * @param rawValue - Raw string value from CLI.
 * @param optionName - Option name for error messages.
 * @param fallback - Default value if not provided.
 * @returns Parsed positive number.
 * @throws Error if value is not a positive number.
 */
export function parsePositiveNumber(
  rawValue: string | undefined,
  optionName: string,
  fallback: number,
): number {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${optionName} value: ${rawValue}. Expected a positive number.`,
    );
  }
  return parsed;
}

/**
 * Parse component kind option.
 *
 * @param rawValue - Raw string value from CLI.
 * @returns Parsed component kind.
 * @throws Error if value is not valid.
 */
export function parseComponentKind(rawValue: string | undefined): string {
  const normalized = String(rawValue || 'component_set').trim().toLowerCase();
  if (
    normalized === 'component_set' ||
    normalized === 'component' ||
    normalized === 'all'
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid --component-kind value: ${rawValue}. Allowed: component_set, component, all.`,
  );
}

/**
 * Parse main capture mode option.
 *
 * @param rawValue - Raw string value from CLI.
 * @returns Parsed capture mode.
 * @throws Error if value is not valid.
 */
export function parseMainCaptureMode(rawValue: string | undefined): string {
  const normalized = String(rawValue || 'rest').trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'agent' || normalized === 'rest') {
    return normalized;
  }
  throw new Error(
    `Invalid --main-capture-mode value: ${rawValue}. Allowed: auto, agent, rest.`,
  );
}
