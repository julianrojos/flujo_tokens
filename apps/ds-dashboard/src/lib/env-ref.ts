/**
 * Normalize env-var references to canonical "${VAR}" shape for API payloads.
 */
const ENV_IDENTIFIER_SOURCE = "[A-Za-z_][A-Za-z0-9_]*";
const BRACED_ENV_REF = new RegExp(`^\\$\\{(${ENV_IDENTIFIER_SOURCE})\\}$`);
const DOLLAR_ENV_REF = new RegExp(`^\\$(${ENV_IDENTIFIER_SOURCE})$`);
const UPPER_SNAKE_ENV_REF = /^[A-Z_][A-Z0-9_]*$/;

function trimToString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeEnvCandidate(raw: unknown, fallback = ""): string {
  const value = trimToString(raw);
  return value || trimToString(fallback);
}

function canonicalizeEnvRef(source: string): string {
  if (!source) return "";
  if (BRACED_ENV_REF.test(source)) return source;
  const dollarVar = source.match(DOLLAR_ENV_REF);
  if (dollarVar) return `\${${dollarVar[1]}}`;
  // Treat only ENV-like identifiers as references (UPPER_SNAKE_CASE).
  // This avoids converting literal secrets like "figd_xxx" into "${figd_xxx}".
  if (UPPER_SNAKE_ENV_REF.test(source)) return `\${${source}}`;
  return source;
}

export function normalizeEnvRef(raw: unknown, fallback = ""): string {
  return canonicalizeEnvRef(normalizeEnvCandidate(raw, fallback));
}
