/**
 * Capture Options
 *
 * Parses and validates command-line options for capture operations.
 */

/**
 * Parse boolean option from string value.
 */
export function parseBooleanOption(
  rawValue: unknown,
  optionName: string,
  fallback: boolean = false,
): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

/**
 * Parse positive number from string value.
 */
export function parsePositiveNumber(
  rawValue: unknown,
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
 */
export function parseComponentKind(rawValue: unknown): 'component_set' | 'component' | 'all' {
  const normalized = String(rawValue || 'component_set')
    .trim()
    .toLowerCase();
  if (
    normalized === 'component_set' ||
    normalized === 'component' ||
    normalized === 'all'
  ) {
    return normalized as 'component_set' | 'component' | 'all';
  }
  throw new Error(
    `Invalid --component-kind value: ${rawValue}. Allowed: component_set, component, all.`,
  );
}

/**
 * Parse main capture mode option.
 */
export function parseMainCaptureMode(rawValue: unknown): 'auto' | 'agent' | 'rest' {
  const normalized = String(rawValue || 'rest')
    .trim()
    .toLowerCase();
  if (normalized === 'auto' || normalized === 'agent' || normalized === 'rest') {
    return normalized as 'auto' | 'agent' | 'rest';
  }
  throw new Error(
    `Invalid --main-capture-mode value: ${rawValue}. Allowed: auto, agent, rest.`,
  );
}
