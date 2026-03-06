/**
 * Normalize env-var references to canonical "${VAR}" shape for API payloads.
 */
export function normalizeEnvRef(raw: unknown, fallback = ""): string {
  const value = String(raw ?? "").trim();
  const source = value || String(fallback || "").trim();
  if (!source) return "";
  if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(source)) return source;
  const dollarVar = source.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (dollarVar) return `\${${dollarVar[1]}}`;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(source)) return `\${${source}}`;
  return source;
}
