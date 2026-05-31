export interface TokenCatalogEntry {
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  resolvedValue: string;
  aliasOf: string | null;
  collection: string;
}

export interface TokenCatalog {
  entries: TokenCatalogEntry[];
  byPath: Record<string, TokenCatalogEntry>;
  bySlashPath: Record<string, TokenCatalogEntry>;
  byVariableId: Record<string, TokenCatalogEntry>;
}
