type TokenCatalogEntryLike = {
  path?: string | null;
  slashPath?: string | null;
  cssVar?: string | null;
  collection?: string | null;
};

export type TokenLookupEntry = {
  path: string;
  slashPath: string;
  collection: string;
};

function normalizeLookupKey(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function normalizeTokenLookupKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^_+/, "")
    .replace(/^semanticos[./]/, "")
    .replace(/^primitivos[./]/, "")
    .replace(/^theme[./]/, "")
    .replace(/^tokens?[./]/, "")
    .replace(/^--+/, "")
    .replace(/[._]+/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

export function buildTokenLookups(entries: TokenCatalogEntryLike[]): {
  exact: Record<string, TokenLookupEntry>;
  fallback: Record<string, TokenLookupEntry | null>;
} {
  return entries.reduce<{
    exact: Record<string, TokenLookupEntry>;
    fallback: Record<string, TokenLookupEntry | null>;
  }>(
    (acc, entry) => {
      const path = String(entry.path || "").trim();
      if (!path) return acc;

      const slashPath = String(entry.slashPath || "").trim();
      const cssVar = String(entry.cssVar || "").trim();
      const collection = String(entry.collection || "").trim();
      const tokenEntry: TokenLookupEntry = { path, slashPath, collection };

      const exactKeys = [normalizeLookupKey(path), normalizeLookupKey(slashPath), normalizeLookupKey(cssVar)].filter(
        Boolean,
      );
      for (const key of exactKeys) {
        acc.exact[key] = tokenEntry;
      }

      const fallbackKeys = [
        normalizeTokenLookupKey(path),
        normalizeTokenLookupKey(slashPath),
        normalizeTokenLookupKey(cssVar),
      ].filter(Boolean);
      for (const key of fallbackKeys) {
        if (!(key in acc.fallback)) {
          acc.fallback[key] = tokenEntry;
          continue;
        }

        const existing = acc.fallback[key];
        if (existing && existing.path !== tokenEntry.path) {
          acc.fallback[key] = null;
        }
      }

      return acc;
    },
    { exact: {}, fallback: {} },
  );
}

export function resolveVariableTokenEntry(
  variableName: string,
  variableKey: string,
  exactLookup: Record<string, TokenLookupEntry>,
  fallbackLookup: Record<string, TokenLookupEntry | null>,
): TokenLookupEntry | null {
  const variableNameExact = normalizeLookupKey(variableName);
  const variableKeyExact = normalizeLookupKey(variableKey);
  return (
    (variableNameExact && exactLookup[variableNameExact]) ||
    (variableKeyExact && exactLookup[variableKeyExact]) ||
    fallbackLookup[normalizeTokenLookupKey(variableName)] ||
    fallbackLookup[normalizeTokenLookupKey(variableKey)] ||
    null
  );
}
