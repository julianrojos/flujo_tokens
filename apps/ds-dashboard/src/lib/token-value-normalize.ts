const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function normalizeHexColor(value: string): string | null {
  const raw = String(value || "").trim();
  if (!HEX_COLOR_RE.test(raw)) return null;
  const hex = raw.slice(1).toUpperCase();
  if (hex.length === 3 || hex.length === 4) {
    return `#${hex
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`;
  }
  return `#${hex}`;
}

export function resolveColorSwatch(value: string): string | null {
  return normalizeHexColor(value);
}

export function normalizeResolvedValueKey(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hex = normalizeHexColor(raw);
  if (hex) return hex;
  return raw.toLowerCase();
}

export function normalizeResolvedValueFilter(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hex = normalizeHexColor(raw);
  if (hex) return hex;
  return raw.toLowerCase();
}
