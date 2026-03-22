/**
 * Check if a value is a TBD (To Be Determined) marker.
 * TBD markers are used as placeholders in specs and docs.
 */
export function isTbdMarker(raw: unknown): boolean {
  return /^tbd$/i.test(String(raw || "").trim());
}
