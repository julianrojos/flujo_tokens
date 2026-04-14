/**
 * Wizard Step Basics - form for Figma URL, token, system name + scan results.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FigmaMcpConnectionTestButton } from "@/components/figma-mcp-connection-test-button";
import type { ScanState, ScannedComponent } from "../hooks/use-new-system-wizard";

interface WizardFormValues {
  systemName: string;
  appName: string;
  figmaFileUrl: string;
  figmaAccessToken: string;
  compileVariablesOnCapture: boolean;
  makeDefault: boolean;
  systemIdOverride: string;
}

interface WizardBasicsDerived {
  generatedSystemId: string;
  figmaFileId: string;
  isFormValid: boolean;
  saving: boolean;
  scanState: ScanState;
  scanComponents: ScannedComponent[];
  scanTruncated: boolean;
  scanTotal: number;
  scanLimit: number;
  scanError: string | null;
  selectedIds: Set<string>;
  canSelectAll: boolean;
  hasSelection: boolean;
}

interface WizardBasicsActions {
  onFieldChange: (field: keyof WizardFormValues, value: string | boolean) => void;
  onScan: () => void;
  onImport: () => void;
  onToggleComponent: (nodeId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

interface WizardStepBasicsProps {
  form: WizardFormValues;
  derived: WizardBasicsDerived;
  actions: WizardBasicsActions;
}

function groupByPageName(components: ScannedComponent[]): Map<string, ScannedComponent[]> {
  const groups = new Map<string, ScannedComponent[]>();
  for (const c of components) {
    const existing = groups.get(c.pageName) || [];
    existing.push(c);
    groups.set(c.pageName, existing);
  }
  return groups;
}

export function WizardStepBasics({ form, derived, actions }: WizardStepBasicsProps) {
  const [autoTriggerToken, setAutoTriggerToken] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState(0);

  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) return derived.scanComponents;
    const q = searchQuery.toLowerCase();
    return derived.scanComponents.filter(
      (c) => c.name.toLowerCase().includes(q) || c.pageName.toLowerCase().includes(q),
    );
  }, [searchQuery, derived.scanComponents]);

  const grouped = useMemo(() => groupByPageName(filteredComponents), [filteredComponents]);
  const groupedPageNames = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const [openPages, setOpenPages] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (derived.scanState !== "loading") {
      setScanElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setScanElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [derived.scanState]);

  useEffect(() => {
    if (derived.scanState === "loading") {
      setSearchQuery("");
    }
  }, [derived.scanState]);

  useEffect(() => {
    if (groupedPageNames.length === 0) {
      setOpenPages(new Set());
      return;
    }
    setOpenPages((prev) => {
      const persisted = new Set<string>();
      for (const pageName of groupedPageNames) {
        if (prev.has(pageName)) persisted.add(pageName);
      }
      // Keep groups collapsed by default; only preserve explicit user-opened groups.
      return persisted;
    });
  }, [groupedPageNames]);

  const togglePage = (pageName: string) => {
    setOpenPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageName)) {
        next.delete(pageName);
      } else {
        next.add(pageName);
      }
      return next;
    });
  };

  const selectAllChecked =
    derived.scanComponents.length > 0 &&
    derived.selectedIds.size === derived.scanComponents.length;
  const someSelected = derived.selectedIds.size > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Basics</CardTitle>
        <CardDescription>Enter your design system information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label htmlFor="figma-file-url" className="text-sm font-medium">Figma file URL *</label>
          <Input
            id="figma-file-url"
            value={form.figmaFileUrl}
            onChange={(e) => actions.onFieldChange("figmaFileUrl", e.target.value)}
            placeholder="https://www.figma.com/file/..."
          />
          {derived.figmaFileId && <p className="mt-1 text-xs text-muted-foreground">File key: {derived.figmaFileId}</p>}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="figma-access-token" className="text-sm font-medium">Figma access token</label>
            <div className="mt-1 space-y-2">
              <Input
                id="figma-access-token"
                value={form.figmaAccessToken}
                onChange={(e) => actions.onFieldChange("figmaAccessToken", e.target.value)}
                placeholder="env:FIGMA_TOKEN"
                onBlur={() => {
                  if (form.figmaFileUrl.trim() && form.figmaAccessToken.trim()) {
                    setAutoTriggerToken((n) => n + 1);
                  }
                }}
              />
              <FigmaMcpConnectionTestButton
                figmaUrl={form.figmaFileUrl}
                figmaToken={form.figmaAccessToken}
                autoTriggerToken={autoTriggerToken}
                className="w-full"
              />
            </div>
          </div>

          <div>
            <label htmlFor="system-name" className="text-sm font-medium">System name *</label>
            <Input
              id="system-name"
              value={form.systemName}
              onChange={(e) => actions.onFieldChange("systemName", e.target.value)}
              placeholder="e.g., Acme Design System"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Generated ID: {derived.generatedSystemId || "—"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.compileVariablesOnCapture}
              onChange={(e) => actions.onFieldChange("compileVariablesOnCapture", e.target.checked)}
            />
            <span className="text-sm">Compile variables on capture</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.makeDefault}
              onChange={(e) => actions.onFieldChange("makeDefault", e.target.checked)}
            />
            <span className="text-sm">Set as default system</span>
          </label>
        </div>

        {/* Scan section */}
        <div className="flex items-center gap-2">
          <Button onClick={actions.onScan} disabled={derived.saving || derived.scanState === "loading"}>
            {derived.scanState === "loading" ? "Scanning…" : "Scan file"}
          </Button>
          {derived.scanState === "loading" ? (
            <span className="text-xs text-muted-foreground">
              Scanning components… ({scanElapsedSeconds}s)
            </span>
          ) : null}
          {derived.scanState === "ready" && (
            <span className="text-xs text-muted-foreground">
              {derived.scanTruncated
                ? `Showing ${derived.scanComponents.length} of ${derived.scanTotal} components (scan limited at ${derived.scanLimit})`
                : `${derived.scanComponents.length} component${derived.scanComponents.length === 1 ? "" : "s"} found`}
            </span>
          )}
        </div>

        {/* Scan error */}
        {derived.scanState === "error" && derived.scanError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <p>{derived.scanError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={actions.onScan}>
              Try again
            </Button>
          </div>
        )}

        {/* Empty state */}
        {derived.scanState === "empty" && (
          <p className="text-sm text-muted-foreground">No components found in this Figma file.</p>
        )}

        {/* Scan results with selection */}
        {derived.scanState === "ready" && derived.scanComponents.length > 0 && (
          <div className="space-y-3">
            {/* Select all + search */}
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  aria-label="Select all detected components"
                  checked={selectAllChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !selectAllChecked;
                  }}
                  onChange={(e) => {
                    if (e.target.checked) {
                      actions.onSelectAll();
                    } else {
                      actions.onDeselectAll();
                    }
                  }}
                  disabled={!derived.canSelectAll || derived.saving}
                />
                Select all
                {!derived.canSelectAll && (
                  <Badge variant="neutral" className="ml-1 text-[10px]">disabled — truncated</Badge>
                )}
              </label>
              <Input
                aria-label="Filter detected components"
                placeholder="Filter by name or page…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs text-sm"
                disabled={derived.saving}
              />
            </div>

            {/* Grouped component list */}
            <div className="max-h-64 overflow-y-auto space-y-3 rounded-md border border-border p-3">
              {filteredComponents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matches for current filter.</p>
              ) : (
                Array.from(grouped.entries()).map(([pageName, comps]) => (
                  <div key={pageName} className="space-y-1">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left text-xs font-medium text-muted-foreground"
                      aria-expanded={openPages.has(pageName)}
                      onClick={() => togglePage(pageName)}
                    >
                      <span>{pageName}</span>
                      <span className="flex items-center gap-1 text-[10px]">
                        {openPages.has(pageName) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        {comps.length}
                      </span>
                    </button>
                    {openPages.has(pageName) &&
                      comps.map((comp) => {
                        const checked = derived.selectedIds.has(comp.nodeId);
                        return (
                          <label key={comp.nodeId} className="flex items-center gap-2 py-0.5 text-sm">
                            <input
                              type="checkbox"
                              aria-label={`Select component ${comp.name}`}
                              checked={checked}
                              onChange={() => actions.onToggleComponent(comp.nodeId)}
                              disabled={derived.saving}
                            />
                            <span>{comp.name}</span>
                          </label>
                        );
                      })}
                  </div>
                ))
              )}
            </div>

            {/* Selection summary */}
            {derived.hasSelection && (
              <p className="text-xs text-muted-foreground">
                {derived.selectedIds.size} of {derived.scanComponents.length} selected
              </p>
            )}
          </div>
        )}

        {/* Import button */}
        <Button
          onClick={actions.onImport}
          disabled={!derived.isFormValid || derived.saving || derived.scanState !== "ready" || !derived.hasSelection}
        >
          {derived.saving ? "Creating…" : "Import Design System"}
        </Button>
        {derived.scanState !== "ready" && (
          <p className="text-xs text-muted-foreground">
            Scan first to see available components before importing.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
