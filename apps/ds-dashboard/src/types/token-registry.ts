export interface TokenEntry {
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  resolvedValue: string;
  aliasOf?: string;
  collection: string;
}

export interface TokenRegistry {
  entries: TokenEntry[];
  byPath: Record<string, TokenEntry>;
  bySlashPath: Record<string, TokenEntry>;
}
