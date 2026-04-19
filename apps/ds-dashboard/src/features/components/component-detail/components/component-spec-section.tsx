/**
 * Component Spec Section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { FilePenLine } from "lucide-react";
import type { PartialComponentSpec } from "ds-types";
import { ComponentSpecViewer } from "../component-spec-viewer";
import { FigmaDescriptionSection } from "./figma-description-section";

interface ComponentSpecSectionProps {
  spec: PartialComponentSpec | null;
  canOpenDocs: boolean;
  showDownloadMarkdown?: boolean;
  isDownloadingMarkdown?: boolean;
  downloadError?: string | null;
  downloadWarnings?: string[];
  onDownloadMarkdown: () => void;
  onOpenEditorial: () => void;
  figmaComponentSetDescription?: string | null;
  figmaVariantDescriptions?: Array<{ canonicalKey: string; description: string | null }>;
}

export function ComponentSpecSection({
  spec,
  canOpenDocs,
  showDownloadMarkdown = false,
  isDownloadingMarkdown = false,
  downloadError = null,
  downloadWarnings = [],
  onDownloadMarkdown,
  onOpenEditorial,
  figmaComponentSetDescription = null,
  figmaVariantDescriptions = [],
}: ComponentSpecSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Specification</CardTitle>
              <CardDescription>Component documentation</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {canOpenDocs && showDownloadMarkdown && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDownloadMarkdown}
                  disabled={isDownloadingMarkdown}
                  aria-busy={isDownloadingMarkdown}
                >
                  {isDownloadingMarkdown ? "Downloading..." : "Download markdown"}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onOpenEditorial}>
                <FilePenLine className="mr-2 h-4 w-4" /> {spec ? "Edit spec" : "Add spec"}
              </Button>
            </div>
          </div>
          {downloadError ? (
            <StatusAlert
              variant="error"
              title="Download failed"
              description={downloadError}
            >
              {canOpenDocs && showDownloadMarkdown ? (
                <div className="pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onDownloadMarkdown}
                    disabled={isDownloadingMarkdown}
                  >
                    {isDownloadingMarkdown ? "Retrying..." : "Retry download"}
                  </Button>
                </div>
              ) : null}
            </StatusAlert>
          ) : null}
          {downloadWarnings.length > 0 ? (
            <StatusAlert
              variant="warning"
              title="Download completed with warnings"
              description={downloadWarnings.join(" · ")}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <FigmaDescriptionSection
          componentSetDescription={figmaComponentSetDescription}
          variantDescriptions={figmaVariantDescriptions}
        />
        {spec && (
          <div className="border-t border-border my-4" />
        )}
        {spec ? (
          <ComponentSpecViewer spec={spec} />
        ) : (
          <div className="rounded border border-border bg-muted p-6 text-center text-sm text-muted-foreground">
            No specification yet. Click "Add spec" to create one.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
