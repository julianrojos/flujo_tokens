import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiErrorMessage } from "@/components/api-error-message";
import { FigmaUrlScanner } from "@/features/components/figma-url-scanner";
import {
  captureFigmaScreenshot,
  createDesignSystem,
  type CaptureFigmaProgress,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useDesignSystem } from "@/lib/design-system-context";

function toSystemId(rawName: string) {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function extractFigmaFileIdFromUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === "file" || segments[i] === "design") {
        return segments[i + 1] || "";
      }
    }
  } catch {
    return "";
  }

  return "";
}

function toDocumentWideFigmaUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    parsed.searchParams.delete("node-id");
    parsed.searchParams.delete("node_id");
    parsed.searchParams.delete("nodeId");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function getCaptureErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const message = error.message || "Unknown error";
  const match = message.match(/:\s*(\{[\s\S]+\})\s*$/);
  if (!match) return message;
  try {
    const parsed = JSON.parse(match[1]) as {
      error?: string;
      message?: string;
      failed?: Array<{ error?: string }>;
      registry_refresh?: { stderr?: string };
    };
    return (
      parsed.error ||
      parsed.message ||
      parsed.failed?.[0]?.error ||
      parsed.registry_refresh?.stderr ||
      message
    );
  } catch {
    return message;
  }
}

function makeInlineErrorDisplay(args: {
  title: string;
  message: string;
  action?: string;
  retryable?: boolean;
}): ApiErrorDisplay {
  return {
    title: args.title,
    message: args.message,
    action: args.action ?? null,
    code: null,
    requestId: null,
    retryable: args.retryable ?? true,
  };
}

export function NewSystemPage() {
  const navigate = useNavigate();
  const { replaceSystems } = useDesignSystem();

  const [systemName, setSystemName] = useState("");
  const [systemIdOverride, setSystemIdOverride] = useState("");
  const [appName, setAppName] = useState("");
  const [figmaFileUrl, setFigmaFileUrl] = useState("");
  const [figmaAccessToken, setFigmaAccessToken] = useState("");
  const [compileVariablesOnCapture, setCompileVariablesOnCapture] = useState(true);
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiErrorDisplay | null>(null);
  const [savedSystemId, setSavedSystemId] = useState("");
  const [captureProgress, setCaptureProgress] = useState<CaptureFigmaProgress | null>(null);

  const generatedFromName = useMemo(() => toSystemId(systemName), [systemName]);
  const generatedSystemId = (systemIdOverride.trim() || generatedFromName).trim();
  const safeId = generatedSystemId || "my-new-system";
  const figmaFileId = extractFigmaFileIdFromUrl(figmaFileUrl);
  const safeInputDir = `input/${safeId}`;
  const safeOutputDir = `output/${safeId}`;
  const safeDocsDir = `docs/${safeId}`;

  const hasFigmaUrl = !!figmaFileUrl.trim();
  const hasToken = !!figmaAccessToken.trim();
  const figmaUrlValid = !hasFigmaUrl || (() => {
    try {
      const parsed = new URL(figmaFileUrl.trim());
      const host = parsed.hostname.toLowerCase();
      return host === "figma.com" || host.endsWith(".figma.com");
    } catch {
      return false;
    }
  })();
  const canSave = !!systemName.trim() && !!generatedSystemId && !saving
    && (!hasFigmaUrl || hasToken) && figmaUrlValid;

  const doCreate = async () => {
    setSaving(true);
    setSaveError(null);
    setCaptureProgress(null);
    try {
      const response = await createDesignSystem({
        id: generatedSystemId,
        name: systemName.trim(),
        appName: appName.trim() || undefined,
        figmaFileId: figmaFileId.trim() || undefined,
        figmaApiToken: undefined,
        inputDir: safeInputDir,
        outputDir: safeOutputDir,
        docsDir: safeDocsDir,
        compileVariablesOnCapture,
        makeDefault,
      });

      const trimmedUrl = toDocumentWideFigmaUrl(figmaFileUrl);
      if (trimmedUrl) {
        const runtimeToken = figmaAccessToken.trim();
        try {
          const captureResult = await captureFigmaScreenshot(
            {
              figmaUrl: trimmedUrl,
              figmaToken: runtimeToken || undefined,
              includeVariants: true,
              requireExistingDoc: false,
              continueOnError: true,
              refreshIndices: true,
              componentKind: "all",
            },
            {
              systemId: response.system.id,
              onProgress: (progress) => {
                setCaptureProgress(progress);
              },
            },
          );
          // In dashboard server mode this endpoint is queued and returns 202 + jobId.
          // Keep strict validation only when a synchronous capture payload is returned.
          const isQueuedResponse =
            typeof (captureResult as { jobId?: unknown })?.jobId === "string" &&
            (captureResult.targets_total === undefined &&
              captureResult.captured === undefined &&
              captureResult.failed === undefined);

          if (!isQueuedResponse) {
            const targetsCount =
              captureResult.targets_total ??
              captureResult.targets?.length ??
              0;
            const capturedCount = captureResult.captured?.length ?? 0;
            const failedCount = captureResult.failed?.length ?? 0;
            const captureFailureDetail =
              captureResult.error ||
              captureResult.message ||
              captureResult.stderr ||
              captureResult.failed?.[0]?.error ||
              captureResult.registry_refresh?.stderr ||
              "";

            if (!captureResult.ok && captureFailureDetail) {
              throw new Error(captureFailureDetail);
            }

            if (
              targetsCount > 0 &&
              capturedCount === 0 &&
              failedCount > 0
            ) {
              throw new Error(
                captureFailureDetail ||
                  "Targets were found but every capture failed.",
              );
            }

            if (targetsCount === 0 && capturedCount === 0) {
              throw new Error(
                "No capturable components were found for the provided URL.",
              );
            }
          }
        } catch (error) {
          const details = getCaptureErrorMessage(error);
          setSaveError(
            makeInlineErrorDisplay({
              title: "System created with warnings",
              message: `Initial Figma import failed: ${details}`,
              action: 'Retry from "Import Components from Figma".',
            }),
          );
        }
      }

      replaceSystems(response.config.systems, { activeSystemId: response.system.id });
      setSavedSystemId(response.system.id);
      navigate("/components");
    } catch (error) {
      setSaveError(
        toApiErrorDisplay(error, {
          fallbackTitle: "System creation failed",
          fallbackMessage: "Unable to create design system.",
        }),
      );
    } finally {
      setSaving(false);
      setCaptureProgress(null);
    }
  };

  const handleCreateSystem = async () => {
    if (!canSave) return;
    setSaveError(null);
    await doCreate();
  };

  return (
    <div className="mx-auto max-w-4xl py-8">
      <h1 className="mb-4 text-3xl font-bold tracking-tight">Add New Design System</h1>
      <p className="mb-8 text-muted-foreground">
        Configure the system directly from this page. If collections are empty, they will be filled
        automatically on the first successful Figma capture.
      </p>

      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-xl font-semibold">1. System Configuration</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Figma file URL
              </label>
              <Input
                placeholder="https://www.figma.com/design/..."
                value={figmaFileUrl}
                onChange={(e) => {
                  const nextUrl = e.target.value;
                  setFigmaFileUrl(nextUrl);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Full document import: if URL includes <code>node-id</code>, it will be ignored.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                System name
              </label>
              <Input
                placeholder="e.g. PatternFly Community"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                System id
              </label>
              <Input
                placeholder="auto-generated from name"
                value={systemIdOverride}
                onChange={(e) => setSystemIdOverride(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Resolved id: <code>{generatedSystemId || "—"}</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                App name
              </label>
              <Input
                placeholder="defaults to system name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Figma access token (for initial import)
              </label>
              <Input
                type="password"
                placeholder="figd_..."
                value={figmaAccessToken}
                onChange={(e) => setFigmaAccessToken(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Used only to run the first capture right after creation.
              </p>
              {hasFigmaUrl && !hasToken ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  A token is required when a Figma URL is provided.
                </p>
              ) : null}
            </div>

          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={compileVariablesOnCapture}
              onChange={(e) => setCompileVariablesOnCapture(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              Compile Figma variables to design tokens on first capture
            </span>
          </label>

          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(e) => setMakeDefault(e.target.checked)}
              className="h-4 w-4"
            />
            Set as active system after creation
          </label>

          {saveError ? (
            <ApiErrorMessage error={saveError} className="mt-3" />
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleCreateSystem} disabled={!canSave}>
              {saving ? "Saving..." : "Create system"}
            </Button>
            {saving && hasFigmaUrl && captureProgress ? (
              <span className="text-sm text-muted-foreground">
                {captureProgress.total > 0
                  ? `Importing from Figma: ${captureProgress.completed}/${captureProgress.total} downloaded · ${captureProgress.remaining} remaining`
                  : "Importing from Figma..."}
              </span>
            ) : null}
            {savedSystemId ? (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">
                Saved as <code>{savedSystemId}</code>
              </span>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold">2. Import Components from Figma</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            After creating the system, capture a Figma node to bootstrap docs and make the system
            operational in the sidebar.
          </p>
          <FigmaUrlScanner />
        </section>
      </div>

    </div>
  );
}
