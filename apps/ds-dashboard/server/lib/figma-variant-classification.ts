export function isStructuralFigmaVariantRow(row: {
  properties_json: unknown;
  canonical_key: string | null;
  run_id?: string | null;
}): boolean {
  if (String(row.canonical_key || "").trim()) return false;

  if (String(row.run_id || "").trim()) return true;

  const value = row.properties_json;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  return Object.keys(value as Record<string, unknown>).length > 0;
}
