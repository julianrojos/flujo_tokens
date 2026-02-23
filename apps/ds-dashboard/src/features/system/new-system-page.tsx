import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FigmaUrlScanner } from "@/features/components/figma-url-scanner";
import { createDesignSystem } from "@/lib/api";
import { useDesignSystem } from "@/lib/design-system-context";

function toSystemId(rawName: string) {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseCollectionInput(raw: string) {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function NewSystemPage() {
  const navigate = useNavigate();
  const { replaceSystems } = useDesignSystem();

  const [systemName, setSystemName] = useState("");
  const [systemIdOverride, setSystemIdOverride] = useState("");
  const [appName, setAppName] = useState("");
  const [figmaFileId, setFigmaFileId] = useState("");
  const [figmaApiTokenRef, setFigmaApiTokenRef] = useState("");
  const [collectionsInput, setCollectionsInput] = useState("");
  const [compileVariablesOnCapture, setCompileVariablesOnCapture] = useState(true);
  const [makeDefault, setMakeDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSystemId, setSavedSystemId] = useState("");

  const generatedFromName = useMemo(() => toSystemId(systemName), [systemName]);
  const generatedSystemId = (systemIdOverride.trim() || generatedFromName).trim();
  const safeId = generatedSystemId || "my-new-system";
  const safeName = systemName.trim() || "My New System";
  const safeInputDir = `input/${safeId}`;
  const safeOutputDir = `output/${safeId}`;
  const safeDocsDir = `docs/${safeId}`;

  const configExample = useMemo(() => {
    const collections = parseCollectionInput(collectionsInput);
    const renderedCollections =
      collections.length > 0
        ? collections.map((collection) => `    "${collection}"`).join(",\n")
        : '    "Primitives",\n    "Typography",\n    "Semantic",\n    "Components",\n    "A11y"';

    return `{
  "id": "${safeId}",
  "name": "${safeName}",
  "appName": "${appName.trim() || safeName}",
  "figmaFileId": "${figmaFileId.trim() || "your-figma-file-id"}",
  "figmaApiToken": "${figmaApiTokenRef.trim() || "${FIGMA_TOKEN_MY_SYSTEM}"}",
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
    collectionsInput,
    figmaApiTokenRef,
    figmaFileId,
    compileVariablesOnCapture,
    safeDocsDir,
    safeId,
    safeInputDir,
    safeName,
    safeOutputDir,
  ]);

  const canSave = !!systemName.trim() && !!generatedSystemId && !saving;

  const handleCreateSystem = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await createDesignSystem({
        id: generatedSystemId,
        name: systemName.trim(),
        appName: appName.trim() || undefined,
        figmaFileId: figmaFileId.trim() || undefined,
        figmaApiToken: figmaApiTokenRef.trim() || undefined,
        inputDir: safeInputDir,
        outputDir: safeOutputDir,
        docsDir: safeDocsDir,
        collections: parseCollectionInput(collectionsInput),
        compileVariablesOnCapture,
        makeDefault,
      });
      replaceSystems(response.config.systems, { activeSystemId: response.config.defaultSystem });
      setSavedSystemId(response.system.id);
      navigate("/components");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
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
                Figma file id
              </label>
              <Input
                placeholder="e.g. cILQ4oLJbChpzfTg5Q9jhb"
                value={figmaFileId}
                onChange={(e) => setFigmaFileId(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Figma token env reference
              </label>
              <Input
                placeholder="e.g. ${FIGMA_TOKEN_MY_SYSTEM}"
                value={figmaApiTokenRef}
                onChange={(e) => setFigmaApiTokenRef(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Collections (comma separated, optional)
              </label>
              <Input
                value={collectionsInput}
                onChange={(e) => setCollectionsInput(e.target.value)}
                placeholder="Primitives, Typography, Semantic, Components, A11y"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave empty to auto-populate on first capture.
              </p>
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

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-2 text-xl font-semibold">2. Generated JSON Preview</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Preview of the system entry written to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">tooling/config/design-systems.json</code>.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-black p-4 text-sm text-white">
            {configExample}
          </pre>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold">3. Import Components from Figma</h2>
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
