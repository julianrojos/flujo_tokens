import React from "react";
import { FigmaUrlScanner } from "@/features/components/figma-url-scanner";

export function NewSystemPage() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-3xl font-bold tracking-tight mb-4">Add New Design System</h1>
      <p className="text-muted-foreground mb-8">
        To register a new design system in this application, you need to update your workspace configuration file. Currently, the dashboard only reads from the local filesystem configuration.
      </p>

      <div className="space-y-6">
        <section className="rounded-xl border border-border p-6 bg-card">
          <h2 className="text-xl font-semibold mb-2">1. Update Configuration</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Open the <code className="bg-muted px-1.5 py-0.5 rounded">tooling/config/design-systems.json</code> file in your editor and add a new entry to the <code>systems</code> array.
          </p>
          <div className="relative">
            <pre className="p-4 rounded-lg bg-black text-white text-sm overflow-x-auto">
{`{
  "id": "my-new-system",
  "name": "My New System",
  "figmaFileId": "your-figma-file-id",
  "inputDir": "input/my-new-system",
  "outputDir": "output/my-new-system",
  "docsDir": "docs/my-new-system",
  "collections": [
    "Primitives",
    "Semantic",
    "Components"
  ]
}`}
            </pre>
          </div>
        </section>

        <section className="rounded-xl border border-border p-6 bg-card">
          <h2 className="text-xl font-semibold mb-2">2. Restart Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            After updating the JSON file, the new system will automatically appear in the system switcher dropdown on the next reload.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Import Components from Figma</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Once your system is configured, paste a Figma URL below to generate documentation, capture visual proofs and register the component immediately.
          </p>
          <FigmaUrlScanner />
        </section>
      </div>
    </div>
  );
}
