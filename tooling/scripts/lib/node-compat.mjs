/**
 * Returns true when current Node.js runtime supports stable `--import`.
 * Node >= 18.19.0
 */
export function supportsNodeImportFlag() {
  const [major, minor] = String(process.versions.node || '')
    .split('.')
    .map((segment) => Number(segment));
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  return major > 18 || (major === 18 && minor >= 19);
}
