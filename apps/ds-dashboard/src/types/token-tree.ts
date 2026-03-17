import type { TokenEntry } from "@/types/token-registry";

export type TokenTreeNodeType = "collection" | "group" | "token";

export interface TokenTreeNode {
  id: string;
  name: string;
  type: TokenTreeNodeType;
  path: string;
  children: TokenTreeNode[];
  tokenData?: TokenEntry;
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
