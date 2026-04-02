/**
 * Component Spec Section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FilePenLine } from "lucide-react";
import type { PartialComponentSpec } from "ds-types";
import { ComponentSpecViewer } from "../component-spec-viewer";

interface ComponentSpecSectionProps {
  spec: PartialComponentSpec | null;
  hasDocs: boolean;
  onOpenSpecEditor: () => void;
  onOpenDocs: () => void;
  onOpenEditorial: () => void;
  selfSlug?: string;
}

export function ComponentSpecSection({
  spec,
  hasDocs,
  onOpenSpecEditor,
  onOpenDocs,
  onOpenEditorial,
  selfSlug,
}: ComponentSpecSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Specification</CardTitle>
            <CardDescription>Component documentation</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasDocs && (
              <Button variant="outline" size="sm" onClick={onOpenDocs}>
                Docs
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onOpenSpecEditor}>
              <FilePenLine className="mr-2 h-4 w-4" /> {spec ? "Edit" : "Create"}
            </Button>
            {spec && (
              <Button variant="outline" size="sm" onClick={onOpenEditorial}>
                Edit summary
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {spec ? (
          <ComponentSpecViewer spec={spec} selfSlug={selfSlug} />
        ) : (
          <div className="rounded-lg border border-border bg-muted p-6 text-center text-sm text-muted-foreground">
            No specification yet. Click "Create" to add one.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
