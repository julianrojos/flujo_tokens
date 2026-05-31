export type FigmaVariableSource = 'auto' | 'mcp' | 'rest';

export const VALID_FIGMA_VARIABLE_SOURCES = [
  'auto',
  'mcp',
  'rest',
] as const satisfies readonly FigmaVariableSource[];

export function isFigmaVariableSource(
  value: string,
): value is FigmaVariableSource {
  return VALID_FIGMA_VARIABLE_SOURCES.includes(value as FigmaVariableSource);
}

export class InvalidFigmaVariableSourceError extends Error {
  readonly rawValue: unknown;
  readonly optionName: string;

  constructor(rawValue: unknown, optionName = 'variable source') {
    super(`Invalid ${optionName} value: "${String(rawValue)}". Allowed: auto, mcp, rest.`);
    this.name = 'InvalidFigmaVariableSourceError';
    this.rawValue = rawValue;
    this.optionName = optionName;
  }
}

export interface ParseFigmaVariableSourceOptions {
  defaultValue?: FigmaVariableSource;
  optionName?: string;
}

export function parseFigmaVariableSource(
  rawValue: unknown,
  options: ParseFigmaVariableSourceOptions = {},
): FigmaVariableSource {
  const {
    defaultValue = 'auto',
    optionName = 'variable source',
  } = options;

  const rawNormalized = String(rawValue ?? '').trim().toLowerCase();
  const normalized = rawNormalized || defaultValue;
  if (isFigmaVariableSource(normalized)) {
    return normalized;
  }

  throw new InvalidFigmaVariableSourceError(rawValue, optionName);
}
