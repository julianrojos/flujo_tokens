import type { TokenCatalogEntry } from "@/types/token-catalog";

export type TokenTreeNodeType = "collection" | "group" | "token";

export interface TokenTreeNode {
  id: string;
  name: string;
  type: TokenTreeNodeType;
  path: string;
  children: TokenTreeNode[];
  tokenData?: TokenCatalogEntry;
}

export interface TokenCollectionTree {
  collection: string;
  tokenCount: number;
  root: TokenTreeNode;
}

export interface TokenCollectionTreeIndex {
  collections: TokenCollectionTree[];
  summary: {
    collections: number;
    tokens: number;
  };
}
