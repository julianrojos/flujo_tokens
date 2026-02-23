import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FigmaUrlScanner } from "@/features/components/figma-url-scanner";
import { captureFigmaScreenshot, createDesignSystem } from "@/lib/api";
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSystemId, setSavedSystemId] = useState("");
  const [complexFileModal, setComplexFileModal] = useState<{ componentCount: number } | null>(null);

  const generatedFromName = useMemo(() => toSystemId(systemName), [systemName]);
  const generatedSystemId = (systemIdOverride.trim() || generatedFromName).trim();
  const safeId = generatedSystemId || "my-new-system";
  const safeName = systemName.trim() || "My New System";
  const figmaFileId = extractFigmaFileIdFromUrl(figmaFileUrl);
  const defaultFigmaTokenEnvName = `FIGMA_TOKEN_${safeId
    .replace(/[^a-z0-9-]/gi, "_")
    .replace(/-/g, "_")
    .toUpperCase()}`;
  const safeInputDir = `input/${safeId}`;
  const safeOutputDir = `output/${safeId}`;
  const safeDocsDir = `docs/${safeId}`;
  const collections: string[] = [];

  const configExample = useMemo(() => {
    const renderedCollections =
      collections.length > 0
        ? collections.map((collection) => `    "${collection}"`).join(",\n")
        : '    "Primitives",\n    "Typography",\n    "Semantic",\n    "Components",\n    "A11y"';

    return `{
  "id": "${safeId}",
  "name": "${safeName}",
  "appName": "${appName.trim() || safeName}",
  "figmaFileId": "${figmaFileId.trim() || "your-figma-file-id"}",
  "figmaApiToken": "\${${defaultFigmaTokenEnvName}}",
  "compileVariablesOnCapture": ${compileVariablesOnCapture ? "true" : "false"},
  "inputDir": "${safeInputDir}",
  "outputDir": "${safeOutputDir}",
  "docsDir": "${safeDocsDir}",
  "collections": [
${renderedCollections}
  ]
}`;
  }, [
    appName,
    defaultFigmaTokenEnvName,
    figmaFileId,
    compileVariablesOnCapture,
    collections,
    safeDocsDir,
    safeId,
    safeInputDir,
    safeName,
    safeOutputDir,
  ]);

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
        collections,
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
            { systemId: response.system.id },
          );
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
        } catch (error) {
          const details = getCaptureErrorMessage(error);
          setSaveError(
            `System created, but initial Figma import failed: ${details}. You can retry from "Import Components from Figma".`,
          );
        }
      }

      replaceSystems(response.config.systems, { activeSystemId: response.system.id });
      setSavedSystemId(response.system.id);
      navigate("/components");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSystem = async () => {
    if (!canSave) return;
    setSaveError(null);

    const trimmedUrl = toDocumentWideFigmaUrl(figmaFileUrl);
    if (trimmedUrl) {
      setSaving(true);
      try {
        const runtimeToken = figmaAccessToken.trim();
        const scanResult = await captureFigmaScreenshot({
          figmaUrl: trimmedUrl,
          figmaToken: runtimeToken || undefined,
          dryRun: true,
          componentKind: "all",
        });
        const count =
          scanResult.targets_total ?? scanResult.targets?.length ?? 0;
        if (count > 1) {
          setSaving(false);
          setComplexFileModal({ componentCount: count });
          return;
        }
      } catch (error) {
        // Pre-scan failed — warn the user but don't block creation
        const msg = error instanceof Error ? error.message : String(error);
        console.warn("[NewSystemPage] dry-run pre-scan failed:", error);
        setSaveError(
          `Pre-scan warning: ${msg}. The system will still be created.`,
        );
      }
      setSaving(false);
    }

    await doCreate();
  };

  const handleConfirmCreate = () => {
    setComplexFileModal(null);
    void doCreate();
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
            <p className="mt-3 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleCreateSystem} disabled={!canSave}>
              {saving ? "Saving..." : "Create system"}
            </Button>
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

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-2 text-xl font-semibold">3. Generated JSON Preview</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Preview of the system entry written to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">tooling/config/design-systems.json</code>.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-black p-4 text-sm text-white">
            {configExample}
          </pre>
        </section>
      </div>

      {/* Complex Figma file confirmation modal */}
      {complexFileModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold">Complex Figma file detected</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              This file contains{" "}
              <strong>{complexFileModal.componentCount}</strong> component sets.
              Do you want to add the full design system?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setComplexFileModal(null)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmCreate}>
                Yes, add full design system
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
