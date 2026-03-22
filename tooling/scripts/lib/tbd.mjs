export function isTbdMarker(raw) {
  return /^tbd$/i.test(String(raw || "").trim());
}
