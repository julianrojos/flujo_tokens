export function normalizeStringList(items: ReadonlyArray<unknown> | undefined): string[] {
  return Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter((item) => item.length > 0)
    : [];
}
