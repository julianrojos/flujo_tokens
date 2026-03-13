import type { VariableData as FigmaVariable, VariableCollectionData as FigmaVariableCollection } from '../services/figma-direct-bridge-service.ts';

// DTCG Token types
export type DtcgToken = {
  $value: unknown;
  $type: string;
  $description?: string;
  $id?: string;
};

export type DtcgTokenGroup = {
  [key: string]: DtcgToken | DtcgTokenGroup;
};

export type DtcgTokenSet = DtcgTokenGroup;

// Figma color value type for type-safe color handling
type FigmaColorValue = {
  r: number;
  g: number;
  b: number;
  a?: number;
};

// Type guard for Figma color values
function isFigmaColorValue(c: unknown): c is FigmaColorValue {
  if (typeof c !== 'object' || c === null) return false;
  const col = c as Record<string, unknown>;
  return (
    typeof col.r === 'number' &&
    typeof col.g === 'number' &&
    typeof col.b === 'number' &&
    (col.a === undefined || typeof col.a === 'number')
  );
}

// Convert Figma color to DTCG hex format
// Returns null if input is invalid (caller should skip emitting this token)
export function figmaColorToHexDtcg(c: unknown): string | null {
  // Validate input structure
  if (!isFigmaColorValue(c)) {
    // Return null for invalid color values - caller will skip this token
    return null;
  }

  // Clamp values to [0, 1] range as per DTCG spec
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const r = Math.round(clamp(c.r) * 255);
  const g = Math.round(clamp(c.g) * 255);
  const b = Math.round(clamp(c.b) * 255);
  const a = c.a !== undefined ? Math.round(clamp(c.a) * 255) : 255;

  const toHex = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();

  if (a < 255) {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Map resolved type to DTCG type
function resolvedTypeToDtcgType(type: string): string {
  switch (type) {
    case 'COLOR':
      return 'color';
    case 'FLOAT':
      return 'number';
    case 'STRING':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    default:
      return 'string';
  }
}

// Resolve variable alias path
function resolveVariableAliasPath(
  aliasId: string,
  variables: Record<string, FigmaVariable>,
  visitedAliasIds: Set<string> = new Set(),
  depth = 0,
  maxDepth = 10
): string {
  // Cycle detection
  if (visitedAliasIds.has(aliasId)) {
    return `{unknown.${aliasId}}`; // Fallback for cycles
  }
  if (depth > maxDepth) {
    return `{unknown.${aliasId}}`; // Fallback for depth exceeded
  }

  visitedAliasIds.add(aliasId);
  const aliasedVar = variables[aliasId];
  if (aliasedVar) {
    // Replace / with . per DTCG reference spec: {colors.primary.blue}
    return `{${aliasedVar.name.replaceAll('/', '.')}}`;
  }
  // Fallback: keep reference opaque but valid
  return `{unknown.${aliasId}}`;
}

// Set nested value in DTCG token group
//
// NOTE: _self pattern for token/group collision handling
// When a token and a group share the same path (e.g., 'colors' and 'colors/primary'),
// the token is moved to a _self child to preserve both values in valid DTCG structure.
// This is a local extension to DTCG spec - consumers should ignore _self if not supported.
function setNestedValue(
  obj: DtcgTokenGroup,
  pathSegments: string[],
  value: DtcgToken
) {
  let current = obj;

  for (let i = 0; i < pathSegments.length - 1; i++) {
    const segment = pathSegments[i];
    if (!current[segment]) {
      current[segment] = {};
    } else if (typeof current[segment] === 'object' && !Array.isArray(current[segment])) {
      // If segment already exists as a token (has $value and $type), convert it to a group container
      // This handles cases where a token and a group share the same path (e.g., 'a' and 'a/b')
      const existing = current[segment] as DtcgTokenGroup;
      if ('$value' in existing && '$type' in existing) {
        // Move token to _self child and convert parent to group container
        // This preserves the token value while allowing child tokens
        current[segment] = {
          _self: { $value: existing.$value, $type: existing.$type },
        };
      } else if ('$value' in existing && !('$type' in existing)) {
        // It's a token reference, wrap it
        current[segment] = { $value: current[segment] };
      }
      // If it's already a proper group (like {primary: {...}}), leave it as is
    }
    current = current[segment] as DtcgTokenGroup;
  }

  const lastSegment = pathSegments[pathSegments.length - 1];
  current[lastSegment] = value;
}

// Convert Figma variables to DTCG token set
export function toDtcgTokenSet(
  variables: Record<string, FigmaVariable>,
  collections: Record<string, FigmaVariableCollection>,
  modeId?: string
): DtcgTokenSet {
  const result: DtcgTokenGroup = {};

  for (const [variableId, variable] of Object.entries(variables)) {
    const collection = collections[variable.variableCollectionId];
    const effectiveModeId = modeId || collection?.modes[0]?.modeId || Object.keys(variable.valuesByMode)[0];
    const value = variable.valuesByMode[effectiveModeId];

    let dtcgValue: unknown;

    if (variable.resolvedType === 'COLOR' && typeof value === 'object' && value !== null) {
      const hexColor = figmaColorToHexDtcg(value as Record<string, unknown>);
      // Skip tokens with invalid color values
      if (hexColor === null) {
        // Log for operational observability - helps diagnose malformed Figma data
        console.warn(`[dtcg-transform] Skipping variable with invalid color: id=${variableId}, name=${variable.name}, resolvedType=${variable.resolvedType}`);
        continue;
      }
      dtcgValue = hexColor;
    } else if (variable.resolvedType === 'VARIABLE_ALIAS' && typeof value === 'string') {
      dtcgValue = resolveVariableAliasPath(value, variables, new Set(), 0, 10);
    } else if (variable.resolvedType === 'UNKNOWN') {
      dtcgValue = value;
    } else {
      dtcgValue = value;
    }

    const dtcgToken: DtcgToken = {
      $value: dtcgValue,
      $type: resolvedTypeToDtcgType(variable.resolvedType),
      $id: variableId,
    };

    // Split name by / and set nested value
    const pathSegments = variable.name.split('/').filter(Boolean);
    setNestedValue(result, pathSegments, dtcgToken);
  }

  return result;
}
