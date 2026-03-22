/**
 * Normalizes diacritics in strings by converting Unicode NFKD and removing combining marks.
 * This provides ASCII-compatible normalization for search and file naming.
 * 
 * Examples:
 * - "Botón" → "Boton"
 * - "niño" → "nino" 
 * - "Español" → "Espanol"
 * - "pingüino" → "pinguino"
 * 
 * @param input - The string to normalize
 * @returns The normalized string with diacritics removed
 */
export function stripDiacritics(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  // Convert to NFKD (Normalization Form Compatibility Decomposition)
  // This separates base characters from combining diacritical marks
  const normalized = input.normalize('NFKD');
  
  // Remove combining diacritical marks (Unicode range U+0300 to U+036F)
  // and other combining marks that may appear
  return normalized.replace(/[\u0300-\u036f\u1ab0-\u1aff\u20d0-\u20ff]/g, '');
}
