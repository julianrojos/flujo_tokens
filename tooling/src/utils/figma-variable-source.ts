import * as dsTypes from 'ds-types';
import type { FigmaVariableSource } from 'ds-types';

type ParseFigmaVariableSourceFn = (
  rawValue: unknown,
  options?: { defaultValue?: FigmaVariableSource; optionName?: string },
) => FigmaVariableSource;

const FALLBACK_ALLOWED_SOURCES = new Set<FigmaVariableSource>(['auto', 'mcp', 'rest']);

function parseFigmaVariableSourceFallback(
  rawValue: unknown,
  options?: { defaultValue?: FigmaVariableSource; optionName?: string },
): FigmaVariableSource {
  const optionName = options?.optionName ?? 'source';
  const defaultValue = options?.defaultValue ?? 'mcp';
  const normalized = String(rawValue ?? defaultValue).trim().toLowerCase();
  if (FALLBACK_ALLOWED_SOURCES.has(normalized as FigmaVariableSource)) {
    return normalized as FigmaVariableSource;
  }
  throw new Error(
    `Invalid ${optionName} value: ${rawValue}. Allowed: auto, mcp, rest.`,
  );
}

export function resolveParseFigmaVariableSource(): ParseFigmaVariableSourceFn {
  const candidate = ((dsTypes as any).default ?? dsTypes)?.parseFigmaVariableSource;
  if (typeof candidate === 'function') {
    return candidate as ParseFigmaVariableSourceFn;
  }
  return parseFigmaVariableSourceFallback;
}

