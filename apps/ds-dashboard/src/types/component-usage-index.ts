export interface ComponentUsageEntry {
  uses: string[];
  used_in: string[];
}

export interface ComponentUsageIndex {
  by_slug: Record<string, ComponentUsageEntry>;
}
