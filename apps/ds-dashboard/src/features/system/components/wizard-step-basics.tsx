/**
 * Wizard Step Basics - form for Figma URL, token, system name + scan results.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/common';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@/components/ui/overlay';
import type {
  ScanState,
  ScannedComponent,
} from '../hooks/use-new-system-wizard';

interface WizardFormValues {
  systemName: string;
  appName: string;
  figmaFileUrl: string;
  figmaAccessToken: string;
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
  onFieldChange: (
    field: keyof WizardFormValues,
    value: string | boolean,
  ) => void;
  onFigmaFileUrlBlur: () => void | Promise<void>;
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

function groupByPageName(
  components: ScannedComponent[],
): Map<string, ScannedComponent[]> {
  const groups = new Map<string, ScannedComponent[]>();
  for (const c of components) {
    const existing = groups.get(c.pageName) || [];
    existing.push(c);
    groups.set(c.pageName, existing);
  }
  return groups;
}

function FigmaComponentGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 18 18"
      className="block h-4 w-4 shrink-0 text-[var(--app-brand-figma)]"
      fill="currentColor"
    >
      <path d="M9 1.75 12.25 5 9 8.25 5.75 5 9 1.75Z" />
      <path d="M13 5.75 16.25 9 13 12.25 9.75 9 13 5.75Z" />
      <path d="M9 9.75 12.25 13 9 16.25 5.75 13 9 9.75Z" />
      <path d="M1.75 9 5 5.75 8.25 9 5 12.25 1.75 9Z" />
    </svg>
  );
}

export function WizardStepBasics({
  form,
  derived,
  actions,
}: WizardStepBasicsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState(0);
  const [isScanResultsOpen, setIsScanResultsOpen] = useState(false);
  const previousScanState = useRef<ScanState>(derived.scanState);
  const filterInputRef = useRef<HTMLInputElement | null>(null);

  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) return derived.scanComponents;
    const q = searchQuery.toLowerCase();
    return derived.scanComponents.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.pageName.toLowerCase().includes(q),
    );
  }, [searchQuery, derived.scanComponents]);

  const grouped = useMemo(
    () => groupByPageName(filteredComponents),
    [filteredComponents],
  );
  const groupedPageNames = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const [openPages, setOpenPages] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (derived.scanState !== 'loading') {
      setScanElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setScanElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [derived.scanState]);

  useEffect(() => {
    if (derived.scanState === 'loading') {
      setSearchQuery('');
    }
  }, [derived.scanState]);

  useEffect(() => {
    const previousState = previousScanState.current;
    previousScanState.current = derived.scanState;
    if (
      previousState !== 'ready' &&
      derived.scanState === 'ready' &&
      derived.scanComponents.length > 0
    ) {
      setIsScanResultsOpen(true);
    }
    if (
      derived.scanState === 'idle' ||
      derived.scanState === 'error' ||
      derived.scanState === 'empty'
    ) {
      setIsScanResultsOpen(false);
    }
  }, [derived.scanComponents.length, derived.scanState]);

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

  const togglePageSelection = (components: ScannedComponent[]) => {
    if (components.length === 0) return;
    const pageHasAllSelected = components.every((component) =>
      derived.selectedIds.has(component.nodeId),
    );
    for (const component of components) {
      const isSelected = derived.selectedIds.has(component.nodeId);
      if (pageHasAllSelected && isSelected) {
        actions.onToggleComponent(component.nodeId);
      }
      if (!pageHasAllSelected && !isSelected) {
        actions.onToggleComponent(component.nodeId);
      }
    }
  };

  const selectAllChecked =
    derived.scanComponents.length > 0 &&
    derived.selectedIds.size === derived.scanComponents.length;
  const someSelected = derived.selectedIds.size > 0;
  const handleConfirmImport = () => {
    if (!derived.hasSelection || derived.saving) return;
    actions.onImport();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Basics</CardTitle>
        <CardDescription>Enter your design system information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField id="figma-file-url" label="Figma file URL" required>
          <Input
            id="figma-file-url"
            value={form.figmaFileUrl}
            onChange={(e) =>
              actions.onFieldChange('figmaFileUrl', e.target.value)
            }
            onBlur={() => {
              void actions.onFigmaFileUrlBlur();
            }}
            placeholder="https://www.figma.com/file/..."
          />
        </FormField>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <FormField id="figma-access-token" label="Figma access token">
            <Input
              id="figma-access-token"
              value={form.figmaAccessToken}
              onChange={(e) =>
                actions.onFieldChange('figmaAccessToken', e.target.value)
              }
              placeholder="env:FIGMA_TOKEN"
            />
          </FormField>

          <FormField id="system-name" label="System name" required>
            <Input
              id="system-name"
              value={form.systemName}
              onChange={(e) =>
                actions.onFieldChange('systemName', e.target.value)
              }
              placeholder="e.g., My Design System"
            />
          </FormField>
        </div>

        <label className="flex items-center gap-2">
          <Checkbox
            checked={form.makeDefault}
            onChange={(e) =>
              actions.onFieldChange('makeDefault', e.target.checked)
            }
          />
          <span className="text-sm">Set as default system</span>
        </label>

        {/* Scan section */}
        <div className="space-y-2">
          {derived.scanState === 'loading' ? (
            <span className="text-xs text-muted-foreground">
              Scanning components… ({scanElapsedSeconds}s)
            </span>
          ) : null}
          {derived.scanState === 'ready' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {derived.scanComponents.length} component
                {derived.scanComponents.length === 1 ? '' : 's'} found
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsScanResultsOpen(true)}
              >
                View components
              </Button>
            </div>
          )}
        </div>

        {/* Scan error */}
        {derived.scanState === 'error' && derived.scanError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <p>{derived.scanError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={actions.onScan}
            >
              Try again
            </Button>
          </div>
        )}

        {/* Empty state */}
        {derived.scanState === 'empty' && (
          <p className="text-sm text-muted-foreground">
            No components found in this Figma file.
          </p>
        )}

        <Modal
          open={
            isScanResultsOpen &&
            derived.scanState === 'ready' &&
            derived.scanComponents.length > 0
          }
          onClose={() => setIsScanResultsOpen(false)}
          aria-labelledby="scan-results-title"
        >
          <ModalContent
            size="md"
            className="flex max-h-[85vh] flex-col overflow-hidden"
          >
            <ModalHeader className="items-start gap-4">
              <div className="space-y-1">
                <h3
                  id="scan-results-title"
                  className="text-lg font-titles font-semibold titles-color"
                >
                  Scanned components
                </h3>
                <p className="text-sm text-muted-foreground">
                  {derived.scanTruncated
                    ? `Showing ${derived.scanComponents.length} of ${derived.scanTotal} components (scan limited at ${derived.scanLimit})`
                    : `${derived.scanComponents.length} component${derived.scanComponents.length === 1 ? '' : 's'} found`}
                </p>
              </div>
              <ModalCloseButton
                onClick={() => setIsScanResultsOpen(false)}
                label="Close scanned components"
              />
            </ModalHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    aria-label="Select all detected components"
                    checked={selectAllChecked}
                    indeterminate={someSelected && !selectAllChecked}
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
                    <Badge variant="neutral" className="ml-1 text-[10px]">
                      disabled — truncated
                    </Badge>
                  )}
                </label>
                <div className="relative">
                  <Input
                    ref={filterInputRef}
                    aria-label="Filter detected components"
                    placeholder="Filter by name or page…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-xs pr-9 text-sm"
                    disabled={derived.saving}
                  />
                  {searchQuery.trim() ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0 text-muted-foreground hover:text-foreground"
                      aria-label="Clear filter"
                      onClick={() => {
                        setSearchQuery('');
                        filterInputRef.current?.focus();
                      }}
                      disabled={derived.saving}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border p-3">
                {filteredComponents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No matches for current filter.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Array.from(grouped.entries()).map(([pageName, comps]) => {
                      const pageAllSelected =
                        comps.length > 0 &&
                        comps.every((component) =>
                          derived.selectedIds.has(component.nodeId),
                        );
                      const pageSomeSelected = comps.some((component) =>
                        derived.selectedIds.has(component.nodeId),
                      );

                      return (
                        <div key={pageName} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              aria-label={`Select all components in ${pageName}`}
                              checked={pageAllSelected}
                              indeterminate={
                                pageSomeSelected && !pageAllSelected
                              }
                              onChange={() => togglePageSelection(comps)}
                              disabled={derived.saving}
                            />
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center justify-between text-left text-sm font-medium text-foreground"
                              aria-expanded={openPages.has(pageName)}
                              onClick={() => togglePage(pageName)}
                            >
                              <span>{pageName}</span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                {openPages.has(pageName) ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                {comps.length}
                              </span>
                            </button>
                          </div>
                          {openPages.has(pageName) &&
                            comps.map((comp) => {
                              const checked = derived.selectedIds.has(
                                comp.nodeId,
                              );
                              return (
                                <label
                                  key={comp.nodeId}
                                  className="flex items-center gap-2 py-0.5 text-sm"
                                >
                                  <FigmaComponentGlyph />
                                  <Checkbox
                                    aria-label={`Select component ${comp.name}`}
                                    checked={checked}
                                    onChange={() =>
                                      actions.onToggleComponent(comp.nodeId)
                                    }
                                    disabled={derived.saving}
                                  />
                                  <span className="min-w-0 flex-1">
                                    {comp.name}
                                  </span>
                                </label>
                              );
                            })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {derived.hasSelection && (
                <p className="text-xs text-muted-foreground">
                  {derived.selectedIds.size} of {derived.scanComponents.length}{' '}
                  selected
                </p>
              )}
            </div>
            <ModalFooter className="justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsScanResultsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={!derived.hasSelection || derived.saving}
              >
                Import
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Import button */}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="default"
            onClick={actions.onScan}
            disabled={derived.saving || derived.scanState === 'loading'}
          >
            {derived.scanState === 'loading' ? 'Scanning…' : 'Scan file'}
          </Button>
          <Button
            size="default"
            onClick={actions.onImport}
            disabled={
              !derived.isFormValid ||
              derived.saving ||
              derived.scanState !== 'ready' ||
              !derived.hasSelection
            }
          >
            {derived.saving ? 'Creating…' : 'Import Design System'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
