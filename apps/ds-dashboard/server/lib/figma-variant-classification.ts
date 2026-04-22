function parseVariantPropertiesJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isStructuralFigmaVariantRow(row: {
  properties_json: unknown;
  canonical_key: string | null;
  run_id?: string | null;
}): boolean {
  if (String(row.canonical_key || "").trim()) return false;

  if (String(row.run_id || "").trim()) return true;

  const value = parseVariantPropertiesJson(row.properties_json);
  if (!value) return false;

  return Object.keys(value).length > 0;
}
