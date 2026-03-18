import type { DesignSystemKitResult, KitStyle } from '../../../../tooling/src/services/figma-mcp-variables.ts';
import type { FigmaVariableCollection } from '../../../../tooling/src/utils/figma.ts';
import type { VariableData as FigmaVariable } from '../services/figma-direct-bridge-service.ts';

// Compression levels
export type CompressionLevel = 'full' | 'summary' | 'compact';
export type KitFormat = CompressionLevel | 'auto' | 'dtcg';

// Type definitions for compressed variable outputs
// These define the exact shape returned at each compression level
type CompactVariable = Pick<FigmaVariable, 'id' | 'name' | 'resolvedType'>;
type SummaryVariable = Pick<FigmaVariable, 'id' | 'name' | 'key' | 'variableCollectionId' | 'resolvedType' | 'valuesByMode'>;

// Union type for compressed variable output - explicit about what each level returns
export type CompressedVariable = CompactVariable | SummaryVariable | FigmaVariable;

// Type for compressed tokens - uses CompressedVariable union instead of FigmaVariable
type CompressedTokens = {
  variables: Record<string, CompressedVariable>;
  variableCollections: Record<string, FigmaVariableCollection>;
};

// Result type that properly types compressed variables
export type CompressedKitResult = Omit<DesignSystemKitResult, 'tokens'> & {
  tokens?: CompressedTokens;
};

// Constants
const AUTO_COMPRESS_THRESHOLD_BYTES = 500_000;  // ~500KB uncompressed JSON chars
const SUMMARY_THRESHOLD_BYTES = 1_000_000;       // if still >1MB after summary, go compact

// Estimate JSON size
export function estimateJsonSize(data: unknown): number {
  return JSON.stringify(data).length;
}

// Compress variables based on level
// Returns explicit union type to avoid unsafe casts
export function compressVariables(
  vars: Record<string, FigmaVariable>,
  level: CompressionLevel,
  collections: Record<string, FigmaVariableCollection>
): Record<string, CompressedVariable> {
  if (level === 'full') {
    return { ...vars };
  }

  const result: Record<string, CompressedVariable> = {};

  for (const [id, variable] of Object.entries(vars)) {
    const collection = collections[variable.variableCollectionId];
    const defaultModeId = collection?.modes[0]?.modeId;
    const modeKey = defaultModeId ?? Object.keys(variable.valuesByMode)[0];

    let compressedVar: CompressedVariable;

    if (level === 'compact') {
      // Compact: only id, name, resolvedType (no valuesByMode at all)
      const compactVar: CompactVariable = {
        id: variable.id,
        name: variable.name,
        resolvedType: variable.resolvedType,
      };
      compressedVar = compactVar;
    } else if (level === 'summary') {
      // Summary: include default mode value but no metadata
      const summaryVar: SummaryVariable = {
        id: variable.id,
        name: variable.name,
        key: variable.key,
        variableCollectionId: variable.variableCollectionId,
        resolvedType: variable.resolvedType,
        valuesByMode: modeKey ? { [modeKey]: variable.valuesByMode[modeKey] } : {},
      };
      compressedVar = summaryVar;
    } else {
      // Full: all data
      compressedVar = {
        ...variable,
      };
    }

    result[id] = compressedVar;
  }

  return result;
}

// Compress styles based on level
export function compressStyles(
  styles: KitStyle[],
  level: CompressionLevel
): KitStyle[] {
  if (level === 'full') {
    return [...styles];
  }

  return styles.map(style => {
    if (level === 'compact') {
      // Compact: only id, name, styleType, key
      return {
        id: style.id,
        name: style.name,
        styleType: style.styleType,
        key: style.key,
      };
    }
    // Summary: no description
    return {
      id: style.id,
      name: style.name,
      styleType: style.styleType,
      key: style.key,
    };
  });
}

// Resolve compression level
export function resolveCompressionLevel(
  format: KitFormat,
  dataSize: number
): CompressionLevel {
  switch (format) {
    case 'full':
    case 'summary':
    case 'compact':
      return format;
    case 'auto':
      if (dataSize > SUMMARY_THRESHOLD_BYTES) {
        return 'compact';
      } else if (dataSize > AUTO_COMPRESS_THRESHOLD_BYTES) {
        return 'summary';
      }
      return 'full';
    case 'dtcg':
      return 'full'; // DTCG handled separately
    default:
      return 'full';
  }
}

// Compress design system kit result
// Returns CompressedKitResult with properly typed CompressedVariable union
export function compressKitResult(
  result: DesignSystemKitResult,
  level: CompressionLevel,
  collections: Record<string, FigmaVariableCollection>
): CompressedKitResult {
  // Only compress tokens if they exist in the original result
  const hasTokens = result.tokens !== undefined;

  let compressedResult: CompressedKitResult;

  if (hasTokens) {
    const compressedVariables = compressVariables(
      result.tokens!.variables as Record<string, FigmaVariable> ?? {},
      level,
      collections ?? {}
    );
    const compressedStyles = compressStyles(result.styles ?? [], level);

    compressedResult = {
      ...result,
      tokens: {
        ...result.tokens,
        variables: compressedVariables,
        variableCollections: result.tokens?.variableCollections ?? {},
      },
      styles: compressedStyles,
    };
  } else {
    // No tokens in original - preserve that shape
    const compressedStyles = compressStyles(result.styles ?? [], level);
    compressedResult = {
      ...result,
      styles: compressedStyles,
    };
  }

  return compressedResult;
}
