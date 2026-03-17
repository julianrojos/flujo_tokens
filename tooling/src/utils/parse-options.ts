/**
 * Parse Options Utilities
 *
 * Shared parsing utilities for CLI options.
 */

/**
 * Parse boolean option with validation.
 */
export function parseBooleanOption(
  rawValue: unknown,
  optionName: string,
  fallback = false,
): boolean {
  const normalized = String(rawValue ?? fallback).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: true, false.`);
}

/**
 * Parse positive number with validation.
 * Note: This preserves decimals. Use `parsePositiveInteger` if you need an integer.
 */
export function parsePositiveNumber(
  rawValue: string | undefined,
  optionName: string,
  fallback: number,
): number {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${optionName} value: ${rawValue}. Expected a positive number.`);
  }
  return parsed;
}

/**
 * Parse positive integer with validation.
 * Note: This truncates to an integer using Math.floor. Use `parsePositiveNumber` if you need decimals.
 */
export function parsePositiveInteger(
  rawValue: string | undefined,
  optionName: string,
  fallback: number,
): number {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${optionName} value: ${rawValue}. Expected a positive number.`);
  }
  return Math.floor(parsed);
}

/**
 * Parse and validate agent type.
 */
export function parseAgentType(
  rawValue: string | undefined,
  optionName: string,
): 'codex' | 'claude' | 'gemini' | 'auto' {
  const agent = String(rawValue || 'auto').trim().toLowerCase() as 'codex' | 'claude' | 'gemini' | 'auto';
  const validAgents: Array<'codex' | 'claude' | 'gemini' | 'auto'> = ['codex', 'claude', 'gemini', 'auto'];
  if (!validAgents.includes(agent)) {
    throw new Error(`Invalid ${optionName} value: ${rawValue}. Allowed: codex, claude, gemini, auto.`);
  }
  return agent;
}

/**
 * Parse main capture mode with validation.
 */
export function parseMainCaptureMode(rawValue: string): 'auto' | 'agent' | 'rest' {
  const normalized = String(rawValue || 'auto').trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'agent' || normalized === 'rest') {
    return normalized as 'auto' | 'agent' | 'rest';
  }
  throw new Error(
    `Invalid --main-capture-mode value: ${rawValue}. Allowed: auto, agent, rest.`,
  );
}

/**
 * Normalize variant slug.
 */
export function normalizeVariantSlug(rawValue: string): string {
  return String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}
