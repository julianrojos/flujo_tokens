/**
 * Editorial Patch Schema
 *
 * Defines the structured JSON contract for AI-generated editorial suggestions.
 * The LLM produces this as a second call after generating the markdown doc.
 * Each section maps to columns in component_editorial.
 */

export const EDITORIAL_PATCH_SCHEMA_VERSION = 2 as const;
const EDITORIAL_BEHAVIOR_PATTERNS = [
  'trigger',
  'toggle',
  'selection',
  'disclosure',
  'navigation',
  'input',
  'compound',
  'unknown',
] as const;

export type EditorialBehaviorInteractionPattern =
  | 'trigger'
  | 'toggle'
  | 'selection'
  | 'disclosure'
  | 'navigation'
  | 'input'
  | 'compound'
  | 'unknown';

export interface EditorialPatch {
  schemaVersion: typeof EDITORIAL_PATCH_SCHEMA_VERSION;
  summary?: {
    purpose?: string;
    when_to_use?: string;
    when_not_to_use?: string;
  };
  content_guidelines?: {
    rules?: string[];
  };
  behavior?: {
    interactionPattern?: EditorialBehaviorInteractionPattern;
    description?: string;
    inferredFrom?: string;
    notes?: string[];
  };
  accessibility?: {
    role?: string;
    labeling?: { rules?: string[] };
    notes?: string[];
  };
  qa?: string[];
}

// ─── JSON Schema (for runtime validation) ──────────────────────────────────

export const EDITORIAL_PATCH_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["schemaVersion"],
  properties: {
    schemaVersion: { type: "number", const: EDITORIAL_PATCH_SCHEMA_VERSION },
    summary: {
      type: "object",
      properties: {
        purpose: { type: "string" },
        when_to_use: { type: "string" },
        when_not_to_use: { type: "string" },
      },
      additionalProperties: false,
    },
    content_guidelines: {
      type: "object",
      properties: {
        rules: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    behavior: {
      type: "object",
      properties: {
        interactionPattern: {
          type: "string",
          enum: [...EDITORIAL_BEHAVIOR_PATTERNS],
        },
        description: { type: "string" },
        inferredFrom: { type: "string" },
        notes: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    accessibility: {
      type: "object",
      properties: {
        role: { type: "string" },
        labeling: {
          type: "object",
          properties: {
            rules: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
        notes: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    qa: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
} as const;

// ─── Runtime validator (no external dependency) ────────────────────────────

interface ValidationError {
  path: string;
  message: string;
}

function validateType(
  value: unknown,
  expected: string,
  path: string,
): ValidationError | null {
  const actual = typeof value;
  if (actual === expected) return null;
  return { path, message: `Expected ${expected}, got ${actual}` };
}

function validateArray(
  value: unknown,
  path: string,
): ValidationError | null {
  if (!Array.isArray(value)) {
    return { path, message: `Expected array, got ${typeof value}` };
  }
  for (let i = 0; i < value.length; i += 1) {
    const err = validateType(value[i], "string", `${path}[${i}]`);
    if (err) return err;
  }
  return null;
}

function validateObjectKeys(
  value: unknown,
  allowedKeys: string[],
  path: string,
): ValidationError | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { path, message: `Expected object, got ${typeof value}` };
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!allowedKeys.includes(key)) {
      return { path: `${path}.${key}`, message: `Unknown property "${key}"` };
    }
  }
  return null;
}

function validateSection(
  patch: Record<string, unknown>,
  section: string,
  allowedKeys: string[],
  arrayFields?: string[],
  nestedObjects?: Record<string, { allowedKeys: string[]; arrayFields?: string[] }>,
): ValidationError | null {
  const sectionVal = patch[section];
  if (sectionVal === undefined || sectionVal === null) return null;

  const objErr = validateObjectKeys(sectionVal, allowedKeys, section);
  if (objErr) return objErr;

  const obj = sectionVal as Record<string, unknown>;
  for (const key of allowedKeys) {
    const val = obj[key];
    if (val === undefined || val === null) continue;

    // Check nested object validation
    if (nestedObjects?.[key]) {
      const nested = nestedObjects[key];
      const nestedErr = validateObjectKeys(val, nested.allowedKeys, `${section}.${key}`);
      if (nestedErr) return nestedErr;
      const nestedObj = val as Record<string, unknown>;
      for (const nKey of nested.allowedKeys) {
        const nVal = nestedObj[nKey];
        if (nVal === undefined || nVal === null) continue;
        if (nested.arrayFields?.includes(nKey)) {
          const arrErr = validateArray(nVal, `${section}.${key}.${nKey}`);
          if (arrErr) return arrErr;
        } else {
          const typeErr = validateType(nVal, "string", `${section}.${key}.${nKey}`);
          if (typeErr) return typeErr;
        }
      }
    } else if (arrayFields?.includes(key)) {
      const arrErr = validateArray(val, `${section}.${key}`);
      if (arrErr) return arrErr;
    } else if (section === 'behavior' && key === 'interactionPattern') {
      const typeErr = validateType(val, "string", `${section}.${key}`);
      if (typeErr) return typeErr;
      if (!EDITORIAL_BEHAVIOR_PATTERNS.includes(val as EditorialBehaviorInteractionPattern)) {
        return {
          path: `${section}.${key}`,
          message: `Must be one of ${EDITORIAL_BEHAVIOR_PATTERNS.join('|')}, got ${String(val)}`,
        };
      }
    } else {
      const typeErr = validateType(val, "string", `${section}.${key}`);
      if (typeErr) return typeErr;
    }
  }
  return null;
}

export function validateEditorialPatch(
  raw: unknown,
): { valid: true; patch: EditorialPatch } | { valid: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: [{ path: "$", message: "Expected object" }] };
  }

  const patch = raw as Record<string, unknown>;

  // schemaVersion is required
  if (patch.schemaVersion !== EDITORIAL_PATCH_SCHEMA_VERSION) {
    errors.push({
      path: "schemaVersion",
      message: `Must be ${EDITORIAL_PATCH_SCHEMA_VERSION}, got ${patch.schemaVersion}`,
    });
  }

  // Validate each section
  const sectionChecks: Array<{
    section: string;
    allowedKeys: string[];
    arrayFields?: string[];
    nestedObjects?: Record<string, { allowedKeys: string[]; arrayFields?: string[] }>;
  }> = [
      {
        section: "summary",
        allowedKeys: ["purpose", "when_to_use", "when_not_to_use"],
      },
      {
        section: "content_guidelines",
        allowedKeys: ["rules"],
        arrayFields: ["rules"],
      },
      {
        section: "behavior",
        allowedKeys: ["interactionPattern", "description", "inferredFrom", "notes"],
        arrayFields: ["notes"],
      },
      {
        section: "accessibility",
        allowedKeys: ["role", "labeling", "notes"],
        arrayFields: ["notes"],
        nestedObjects: {
          labeling: { allowedKeys: ["rules"], arrayFields: ["rules"] },
        },
      },
      {
        section: "qa",
        allowedKeys: [],
        arrayFields: [],
      },
    ];

  for (const check of sectionChecks) {
    // For array-only sections (qa), validate directly
    if (check.allowedKeys.length === 0 && check.arrayFields?.length === 0) {
      const val = patch[check.section];
      if (val !== undefined && val !== null) {
        const arrErr = validateArray(val, check.section);
        if (arrErr) errors.push(arrErr);
      }
    } else {
      const err = validateSection(patch, check.section, check.allowedKeys, check.arrayFields, check.nestedObjects);
      if (err) errors.push(err);
    }
  }

  // Check for unknown top-level keys
  const allowedTopLevel = [
    "schemaVersion",
    "summary",
    "content_guidelines",
    "behavior",
    "accessibility",
    "qa",
  ];
  for (const key of Object.keys(patch)) {
    if (!allowedTopLevel.includes(key)) {
      errors.push({ path: key, message: `Unknown property "${key}"` });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, patch: patch as EditorialPatch };
}
