/**
 * Convertir slug snake_case a Title Case para display.
 * @param slug - Slug en formato snake_case.
 * @returns Texto en formato Title Case para UI.
 */
export function slugToDisplayName(slug: string): string {
  return String(slug || "")
    .trim()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Normalizar nombre de variante para matching tolerante (trim + lowercase).
 * @param name - Nombre original de variante.
 * @returns Nombre normalizado para comparación estable.
 */
export function normalizeVariantName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Deduplicar slugs relacionados, excluyendo el slug del componente actual.
 * @param slugs - Lista de slugs relacionados.
 * @param selfSlug - Slug del componente actual para exclusión.
 * @returns Lista deduplicada, sin vacíos y sin self.
 */
export function deduplicateRelated(slugs: string[], selfSlug: string): string[] {
  const normalizedSelf = selfSlug.trim().toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];

  for (const slug of slugs) {
    const trimmed = slug.trim();
    if (!trimmed) continue;

    const normalized = trimmed.toLowerCase();
    if (normalized === normalizedSelf) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

/**
 * Normalizar slug de spec para ruta canónica de componente (kebab-case).
 * @param slug - Slug original (snake_case, kebab-case u otro separador).
 * @returns Slug seguro para ruta /components/:slug.
 */
export function slugToComponentRouteSlug(slug: string): string {
  return String(slug || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
