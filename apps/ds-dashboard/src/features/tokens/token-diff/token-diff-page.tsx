import { useState } from "react";
import { PageHeader } from "@/components/composites/page-header";
import { useTokenDiff, type SortField, type DiffTableRow } from "./hooks/use-token-diff";
import { useSortState } from "@/lib/use-sort-state";
import { useTokenDiffFilterParams } from "./hooks/use-token-diff-filter-params";
import { TokenDiffControls } from "./components/token-diff-controls";
import { TokenDiffStatsGrid } from "./components/token-diff-stats-grid";
import { TokenDiffTable } from "./components/token-diff-table";
import { TokenDiffImpactPanel } from "./components/token-diff-impact-panel";

export function TokenDiffPage() {
  const { search, setSearch, showOnlyBreaking, setShowOnlyBreaking, beforeRef, setBeforeRef } =
    useTokenDiffFilterParams();
  const [selected, setSelected] = useState<DiffTableRow | null>(null);
  const {
    loading, error, stats, usageIndex, graphDependentsMap, usageByPath, addedRows, removedRows, modifiedRows, load,
    selectedUsageEntry, selectedUnresolvedHits, selectedGraphImpact,
  } = useTokenDiff({ initialRef: beforeRef, search, showOnlyBreaking });
  const [tableSort, toggleSort] = useSortState<SortField>({ field: "status", dir: "desc" });
  const sections = [
    { kind: "added" as const, title: "Added", rows: addedRows },
    { kind: "removed" as const, title: "Removed", rows: removedRows },
    { kind: "modified" as const, title: "Modified", rows: modifiedRows },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader title="Token Diff" description="Compare token changes between git references" />
      {error && <div className="text-status-error">{error.message}</div>}
      <TokenDiffControls
        beforeRef={beforeRef}
        onBeforeRefChange={setBeforeRef}
        onLoad={() => {
          setSelected(null);
          void load(beforeRef);
        }}
        loading={loading}
        showOnlyBreaking={showOnlyBreaking} onShowOnlyBreakingChange={setShowOnlyBreaking}
        search={search} onSearchChange={setSearch}
      />
      <TokenDiffStatsGrid stats={stats} usageIndexLoaded={usageIndex !== null} />
      {sections.map((section) => (
        <TokenDiffTable
          key={section.kind}
          kind={section.kind}
          title={section.title}
          rows={section.rows}
          sort={tableSort}
          onSort={toggleSort}
          graphDependentsMap={graphDependentsMap}
          usageByPath={usageByPath}
          onRowClick={setSelected}
          selected={selected}
        />
      ))}
      {selected && (
        <TokenDiffImpactPanel
          selected={selected}
          usageEntry={selectedUsageEntry(selected)}
          unresolvedHits={selectedUnresolvedHits(selected)}
          graphImpact={selectedGraphImpact(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
