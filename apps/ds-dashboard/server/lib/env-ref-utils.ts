/**
 * Utility for ${VAR} env-reference normalization (server-side, storage only).
 * Server persists token references as "${VAR}" and runtime resolution happens in CLI runners.
 */
export function normalizeEnvRef(raw: unknown, fallback = ''): string {
  const value = String(raw ?? '').trim();
  const source = value || String(fallback || '').trim();
  if (!source) return '';
  if (/^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(source)) return source;
  const dollarVar = source.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (dollarVar) return `\${${dollarVar[1]}}`;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(source)) return `\${${source}}`;
  return source;
}

/**
 * Resolves "${VAR_NAME}" against process.env.
 * Also accepts "$VAR" and "VAR" (plain identifier if present in env).
 * If value is not an env reference, returns it unchanged.
 */
export function resolveEnvRef(raw: string | undefined | null): string {
  const src = String(raw ?? '').trim();
  if (!src) return '';
  const braced = src.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
  if (braced) return String(process.env[braced[1]] || '').trim();
  const dollar = src.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (dollar) return String(process.env[dollar[1]] || '').trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(src)) {
    const fromEnv = String(process.env[src] || '').trim();
    if (fromEnv) return fromEnv;
  }
  return src;
}
