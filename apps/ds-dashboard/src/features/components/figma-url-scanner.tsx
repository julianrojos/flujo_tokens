import { useEffect, useState } from "react";
import { Figma, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDesignSystem } from "@/lib/design-system-context";
import {
  captureFigmaScreenshot,
  fetchComponentRegistry,
  type CaptureFigmaProgress,
  type CaptureFigmaScreenshotResult,
  type CaptureFigmaScreenshotArgs,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FigmaUrlScannerProps {
  /** Called after a successful scan to trigger a data refresh in the parent. */
  onSuccess?: () => void;
}

type ScannerResult = CaptureFigmaScreenshotResult & {
  message?: string;
  stderr?: string;
  stdout?: string;
  command?: string;
  exit_code?: number;
};

interface ExistingComponentScanModalState {
  existingSlugs: string[];
  totalTargets: number;
  request: CaptureFigmaScreenshotArgs;
}

const FIGMA_TOKEN_STORAGE_KEY = "ds-dashboard.figma-token.enc.v1";
const FIGMA_TOKEN_SESSION_KEY = "ds-dashboard.figma-token.key.v1";
const FIGMA_TOKEN_TTL_MS = 15 * 60 * 1000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getOrCreateSessionKey(): Uint8Array {
  const existing = sessionStorage.getItem(FIGMA_TOKEN_SESSION_KEY);
  if (existing) return base64ToBytes(existing);
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  sessionStorage.setItem(FIGMA_TOKEN_SESSION_KEY, bytesToBase64(fresh));
  return fresh;
}

async function encryptToken(token: string): Promise<string> {
  const keyMaterial = getOrCreateSessionKey();
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyMaterial), "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(token);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encoded),
  );
  return JSON.stringify({
    v: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
    expiresAt: Date.now() + FIGMA_TOKEN_TTL_MS,
  });
}

async function decryptToken(serialized: string): Promise<string | null> {
  const parsed = JSON.parse(serialized) as {
    v?: number;
    iv?: string;
    data?: string;
    expiresAt?: number;
  };
  if (parsed.v !== 1 || !parsed.iv || !parsed.data) return null;
  if (!parsed.expiresAt || parsed.expiresAt < Date.now()) return null;

  const sessionKey = sessionStorage.getItem(FIGMA_TOKEN_SESSION_KEY);
  if (!sessionKey) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(base64ToBytes(sessionKey)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(base64ToBytes(parsed.iv)) },
    key,
    toArrayBuffer(base64ToBytes(parsed.data)),
  );
  return new TextDecoder().decode(decrypted);
}

function getFigmaUrlValidationError(rawUrl: string): string | null {
  const value = rawUrl.trim();
  if (!value) return "Paste a Figma URL to continue.";

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Invalid URL format.";
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "figma.com" && !host.endsWith(".figma.com")) {
    return "URL host must be figma.com.";
  }

  return null;
}

export function FigmaUrlScanner({ onSuccess }: FigmaUrlScannerProps) {
  const { activeSystem, isLoading: isSystemLoading } = useDesignSystem();

  const [url, setUrl] = useState("");
  const [figmaToken, setFigmaToken] = useState("");
  const [rememberToken, setRememberToken] = useState(true);
  const [componentSlug, setComponentSlug] = useState("");
  const [requireExistingDoc, setRequireExistingDoc] = useState(false);
  const [includeVariants, setIncludeVariants] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<CaptureFigmaProgress | null>(null);
  const [result, setResult] = useState<ScannerResult | null>(null);
  const [existingSlugs, setExistingSlugs] = useState<Set<string>>(new Set());
  const [registryLoaded, setRegistryLoaded] = useState(false);
  const [confirmModal, setConfirmModal] =
    useState<ExistingComponentScanModalState | null>(null);

  const advancedOptionsId = "figma-scanner-advanced-options";

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const encrypted = localStorage.getItem(FIGMA_TOKEN_STORAGE_KEY);
        if (!encrypted) return;
        const restored = await decryptToken(encrypted);
        if (!restored) {
          localStorage.removeItem(FIGMA_TOKEN_STORAGE_KEY);
          return;
        }
        if (!cancelled) setFigmaToken(restored);
      } catch {
        localStorage.removeItem(FIGMA_TOKEN_STORAGE_KEY);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (!rememberToken || !figmaToken.trim()) {
        localStorage.removeItem(FIGMA_TOKEN_STORAGE_KEY);
        return;
      }
      try {
        const encrypted = await encryptToken(figmaToken.trim());
        if (!cancelled) localStorage.setItem(FIGMA_TOKEN_STORAGE_KEY, encrypted);
      } catch {
        if (!cancelled) localStorage.removeItem(FIGMA_TOKEN_STORAGE_KEY);
      }
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, [figmaToken, rememberToken]);

  useEffect(() => {
    let cancelled = false;
    const loadRegistrySlugs = async () => {
      if (!activeSystem || isSystemLoading) {
        if (!cancelled) {
          setExistingSlugs(new Set());
          setRegistryLoaded(false);
        }
        return;
      }
      try {
        const registry = await fetchComponentRegistry();
        if (cancelled) return;
        const next = new Set(
          (registry.components || [])
            .map((item) => String(item?.slug || "").trim())
            .filter(Boolean),
        );
        setExistingSlugs(next);
      } catch {
        if (!cancelled) setExistingSlugs(new Set());
      } finally {
        if (!cancelled) setRegistryLoaded(true);
      }
    };
    void loadRegistrySlugs();
    return () => {
      cancelled = true;
    };
  }, [activeSystem, isSystemLoading]);

  const buildScanRequest = (): CaptureFigmaScreenshotArgs => ({
    figmaUrl: url.trim(),
    figmaToken: figmaToken.trim() || undefined,
    componentSlug: componentSlug.trim() || undefined,
    requireExistingDoc,
    includeVariants,
    injectDocSpecs: true,
    refreshIndices: true,
    continueOnError: true,
  });

  const extractExistingTargets = (
    preview: CaptureFigmaScreenshotResult,
    currentExistingSlugs: Set<string>,
  ) => {
    const targets = Array.isArray(preview?.targets) ? preview.targets : [];
    const matched = new Set<string>();
    for (const target of targets) {
      const slug = String(target?.slug || "").trim();
      if (!slug) continue;
      if (currentExistingSlugs.has(slug)) matched.add(slug);
    }
    return {
      existing: Array.from(matched).sort((a, b) => a.localeCompare(b)),
      totalTargets: targets.length,
    };
  };

  const applyScanResult = async (data: CaptureFigmaScreenshotResult) => {
    setResult(data as ScannerResult);
    const capturedCount = Array.isArray(data.captured) ? data.captured.length : 0;
    if (data.ok && activeSystem && capturedCount > 0) {
      window.dispatchEvent(
        new CustomEvent("ds:system-captured-first-component", {
          detail: { systemId: activeSystem, capturedCount },
        }),
      );
    }
    if (data.ok && capturedCount > 0 && onSuccess) {
      await Promise.resolve(onSuccess());
    }
  };

  const runScanRequest = async (request: CaptureFigmaScreenshotArgs) => {
    const data = await captureFigmaScreenshot(request, {
      onProgress: (nextProgress) => setProgress(nextProgress),
    });
    await applyScanResult(data);
  };

  const handleScan = async () => {
    if (!url.trim() || !activeSystem || isSystemLoading) return;

    setConfirmModal(null);
    setLoading(true);
    setProgress(null);
    setResult(null);

    try {
      const request = buildScanRequest();
      let currentExistingSlugs = existingSlugs;
      if (!registryLoaded) {
        try {
          const registry = await fetchComponentRegistry();
          currentExistingSlugs = new Set(
            (registry.components || [])
              .map((item) => String(item?.slug || "").trim())
              .filter(Boolean),
          );
          setExistingSlugs(currentExistingSlugs);
        } catch {
          currentExistingSlugs = new Set(existingSlugs);
        } finally {
          setRegistryLoaded(true);
        }
      }

      const preview = await captureFigmaScreenshot({
        ...request,
        dryRun: true,
        refreshIndices: false,
      });

      const { existing, totalTargets } = extractExistingTargets(
        preview,
        currentExistingSlugs,
      );

      if (existing.length > 0) {
        setConfirmModal({
          existingSlugs: existing,
          totalTargets,
          request,
        });
        return;
      }

      await runScanRequest(request);
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleConfirmContinue = async () => {
    if (!confirmModal) return;
    setLoading(true);
    setProgress(null);
    setResult(null);
    try {
      await runScanRequest(confirmModal.request);
      setConfirmModal(null);
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const failedCount = result?.failed?.length ?? 0;
  const capturedCount = result?.captured?.length ?? 0;
  const skippedCount = result?.skipped?.length ?? 0;

  const derivedError =
    result?.error ||
    result?.message ||
    result?.stderr ||
    result?.failed?.[0]?.error ||
    result?.registry_refresh?.stderr ||
    "Scan failed";

  const primarySuccessSlug = result?.captured?.[0]?.slug || result?.targets?.[0]?.slug || null;

  const urlValidationError = getFigmaUrlValidationError(url);
  const canSubmit = !loading && !isSystemLoading && !!activeSystem && !urlValidationError;

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
            aria-invalid={!!url.trim() && !!urlValidationError}
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
        {!!url.trim() && urlValidationError ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">{urlValidationError}</p>
        ) : null}
        {loading && progress ? (
          <p className="text-xs text-muted-foreground">
            {progress.total > 0
              ? `Importing from Figma: ${progress.completed}/${progress.total} downloaded · ${progress.remaining} remaining`
              : "Importing from Figma..."}
          </p>
        ) : null}

        {/* Advanced options toggle */}
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          aria-controls={advancedOptionsId}
        >
          {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Advanced options
        </button>

        {showAdvanced && (
          <div
            id={advancedOptionsId}
            className="rounded-lg border border-border bg-muted/30 p-3 space-y-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="w-36 text-xs text-muted-foreground">Figma token (optional)</span>
              <Input
                type="password"
                placeholder="figd_..."
                value={figmaToken}
                onChange={(e) => setFigmaToken(e.target.value)}
                className="h-7 text-xs font-mono"
                disabled={loading}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={rememberToken}
                onChange={(e) => setRememberToken(e.target.checked)}
                disabled={loading}
                className="h-3.5 w-3.5"
              />
              <span>Remember token for 15 minutes (encrypted)</span>
            </label>
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
            <div className="space-y-1 min-w-0">
              <p className="font-medium">
                {result.ok
                  ? primarySuccessSlug
                    ? `Component "${primarySuccessSlug}" scanned successfully`
                    : `Scan completed — ${capturedCount} component(s) captured`
                  : derivedError}
              </p>
              {result.ok ? (
                <p className="text-xs opacity-80">
                  Captured: {capturedCount} · Failed: {failedCount} · Skipped: {skippedCount}
                </p>
              ) : null}
              {!result.ok && !result.error && !result.message && !result.stderr && failedCount === 0 && (
                <p className="text-xs opacity-80">
                  Make sure <code>FIGMA_TOKEN</code> is set in your{" "}
                  <code>.env</code> file and the dashboard server is restarted.
                </p>
              )}
              {result.failed && result.failed.length > 0 && (
                <ul className="list-inside list-disc text-xs opacity-80">
                  {result.failed.slice(0, 3).map((item, i) => (
                    <li key={`${item.slug}-${i}`}>
                      {item.slug}: {item.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {!activeSystem && !isSystemLoading ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Select a design system before scanning from Figma.
          </p>
        ) : null}
      </CardContent>

      {confirmModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold">Overwrite existing component data?</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              This scan targets {confirmModal.totalTargets} component
              {confirmModal.totalTargets === 1 ? "" : "s"} and will overwrite existing
              documentation for {confirmModal.existingSlugs.length} component
              {confirmModal.existingSlugs.length === 1 ? "" : "s"}.
            </p>
            <div className="mb-4 max-h-40 overflow-auto rounded-md border border-border/70 bg-muted/30 p-2">
              <ul className="space-y-1 text-sm">
                {confirmModal.existingSlugs.map((slug) => (
                  <li key={slug}>
                    <code>{slug}</code>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmModal(null)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleConfirmContinue()} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning…
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
