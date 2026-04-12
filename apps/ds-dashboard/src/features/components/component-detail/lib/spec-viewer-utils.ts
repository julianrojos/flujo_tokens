/**
 * Normalizar nombre de variante para matching tolerante (trim + lowercase).
 * @param name - Nombre original de variante.
 * @returns Nombre normalizado para comparación estable.
 */
export function normalizeVariantName(name: string): string {
  return name.trim().toLowerCase();
}
