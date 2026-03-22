/**
 * Token Diff Controls - before ref input, search, and filters.
 */

import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DIFF_PRESETS = [
  { value: "HEAD~1", label: "HEAD~1" },
  { value: "HEAD~5", label: "HEAD~5" },
  { value: "HEAD~20", label: "HEAD~20" },
  { value: "main", label: "main" },
  { value: "origin/main", label: "origin/main" },
];

interface TokenDiffControlsProps {
  beforeRef: string;
  onBeforeRefChange: (value: string) => void;
  onLoad: () => void;
  loading: boolean;
  showOnlyBreaking: boolean;
  onShowOnlyBreakingChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sourceBefore?: string;
}

export function TokenDiffControls({
  beforeRef,
  onBeforeRefChange,
  onLoad,
  loading,
  showOnlyBreaking,
  onShowOnlyBreakingChange,
  search,
  onSearchChange,
  sourceBefore,
}: TokenDiffControlsProps) {
  const selectedPreset = DIFF_PRESETS.some((preset) => preset.value === beforeRef)
    ? beforeRef
    : "custom";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Before ref</label>
            <Select
              value={selectedPreset}
              onChange={(e) => {
                if (e.target.value === "custom") return;
                onBeforeRefChange(e.target.value);
              }}
              disabled={loading}
            >
              {DIFF_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">custom</option>
            </Select>
            <Input
              value={beforeRef}
              onChange={(e) => onBeforeRefChange(e.target.value)}
              placeholder="e.g., HEAD~1, main, commit SHA"
              disabled={loading}
            />
          </div>

          <Button onClick={onLoad} disabled={loading}>
            {loading ? "Loading..." : "Compare"}
          </Button>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="breaking-only"
              checked={showOnlyBreaking}
              onChange={(e) => onShowOnlyBreakingChange(e.target.checked)}
              className="h-4 w-4"
              disabled={loading}
            />
            <label htmlFor="breaking-only" className="text-sm">
              Breaking only
            </label>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search tokens..."
              disabled={loading}
            />
          </div>

          {sourceBefore && (
            <div className="text-xs text-muted-foreground">
              Source: {sourceBefore}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
