const normalizeSystemNamespace = (systemId: string | null | undefined) => {
  const value = String(systemId || '').trim();
  return value || 'global';
};

const EPOCH_KEY = (systemId: string | null | undefined) =>
  `edit-docs-epoch-v1-${normalizeSystemNamespace(systemId)}`;

function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Fail-open
  }
}

function readEpoch(systemId: string | null | undefined): string {
  const existing = safeStorageGet(EPOCH_KEY(systemId));
  if (existing && existing.trim()) return existing;
  return '0';
}

export function getEditDocsStorageScope(systemId: string | null | undefined): string {
  return `${normalizeSystemNamespace(systemId)}:${readEpoch(systemId)}`;
}

export function bumpEditDocsStorageEpoch(systemId: string | null | undefined): string {
  const nextEpoch = `${Date.now()}`;
  safeStorageSet(EPOCH_KEY(systemId), nextEpoch);
  return nextEpoch;
}

