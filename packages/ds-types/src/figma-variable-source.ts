export type FigmaVariableSource = 'auto' | 'mcp' | 'rest';

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
  if (normalized === 'auto' || normalized === 'mcp' || normalized === 'rest') {
    return normalized;
  }

  throw new InvalidFigmaVariableSourceError(rawValue, optionName);
}
