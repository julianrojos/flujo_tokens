import { useState } from "react";
import { Figma, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDesignSystem } from "@/lib/design-system-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ScanError {
  step?: string;
  message: string;
}

interface ScanResult {
  ok: boolean;
  message?: string;
  componentSlug?: string | null;
  warnings?: ScanError[];
  errors?: ScanError[];
  artifacts?: string[];
}

interface FigmaUrlScannerProps {
  /** Called after a successful scan to trigger a data refresh in the parent. */
  onSuccess?: () => void;
}

export function FigmaUrlScanner({ onSuccess }: FigmaUrlScannerProps) {
  const { activeSystem } = useDesignSystem();

  const [url, setUrl] = useState("");
  const [componentSlug, setComponentSlug] = useState("");
  const [requireExistingDoc, setRequireExistingDoc] = useState(false);
  const [includeVariants, setIncludeVariants] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const handleScan = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/capture-figma-screenshot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ds-system": activeSystem ?? "",
        },
        body: JSON.stringify({
          figmaUrl: url.trim(),
          componentSlug: componentSlug.trim() || undefined,
          requireExistingDoc,
          includeVariants,
          refreshIndices: true,
          continueOnError: true,
        }),
      });

      const data: ScanResult = await response.json();
      setResult(data);
      if (data.ok && onSuccess) {
        onSuccess();
      }
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && url.trim().length > 0;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F24E1E]/10 text-[#F24E1E]">
            <Figma className="h-4 w-4" />
          </span>
          <div>
            <CardTitle className="text-base">Import from Figma</CardTitle>
            <CardDescription className="text-xs">
              Paste a Figma URL to generate docs, capture visual proof and refresh the registry.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Main URL input */}
        <div className="flex gap-2">
          <Input
            id="figma-scan-url"
            placeholder="https://www.figma.com/design/…?node-id=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && handleScan()}
            className="font-mono text-xs"
            disabled={loading}
          />
          <Button onClick={handleScan} disabled={!canSubmit} className="shrink-0">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning…
              </>
            ) : (
              "Scan"
            )}
          </Button>
        </div>

        {/* Advanced options toggle */}
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Advanced options
        </button>

        {showAdvanced && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-36 text-xs text-muted-foreground">Component slug hint</span>
              <Input
                placeholder="e.g. button"
                value={componentSlug}
                onChange={(e) => setComponentSlug(e.target.value)}
                className="h-7 text-xs font-mono"
                disabled={loading}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={requireExistingDoc}
                onChange={(e) => setRequireExistingDoc(e.target.checked)}
                disabled={loading}
                className="h-3.5 w-3.5"
              />
              <span>Require existing doc (skip new components)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={includeVariants}
                onChange={(e) => setIncludeVariants(e.target.checked)}
                disabled={loading}
                className="h-3.5 w-3.5"
              />
              <span>Include variant screenshots</span>
            </label>
          </div>
        )}

        {/* Result feedback */}
        {result && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
              result.ok
                ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
                : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="space-y-1">
              <p className="font-medium">
                {result.ok
                  ? `Component "${result.componentSlug ?? "unknown"}" scanned successfully`
                  : result.message ?? "Scan failed"}
              </p>
              {result.warnings && result.warnings.length > 0 && (
                <ul className="list-inside list-disc text-xs opacity-80">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              )}
              {!result.ok && result.errors && result.errors.length > 0 && (
                <ul className="list-inside list-disc text-xs opacity-80">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
