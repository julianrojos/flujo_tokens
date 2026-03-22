/**
 * Component Pipeline Section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PipelineStage } from "@/types/component-registry";
import { STAGE_LABELS, PIPELINE_STAGES } from "../lib/component-detail-transforms";

interface ComponentPipelineSectionProps {
  currentStage: PipelineStage | null;
  hasFigmaUrl: boolean;
  hasDocs: boolean;
  onCapture: () => void;
  onOpenSpec: () => void;
  onOpenDocs: () => void;
}

export function ComponentPipelineSection({
  currentStage,
  hasFigmaUrl,
  hasDocs,
  onCapture,
  onOpenSpec,
  onOpenDocs,
}: ComponentPipelineSectionProps) {
  const stages = PIPELINE_STAGES;
  const currentIdx = currentStage ? stages.indexOf(currentStage) : -1;

  const cta = (() => {
    if (!currentStage) return null;
    if (currentStage === "missing-spec") return { label: "Create spec", onClick: onOpenSpec };
    if (currentStage === "spec") return { label: "Edit spec", onClick: onOpenSpec };
    if (currentStage === "markdown" || currentStage === "render") {
      if (!hasFigmaUrl) return null;
      return { label: "Capture visual proof", onClick: onCapture };
    }
    if (currentStage === "visual-proof" && hasDocs) {
      return { label: "Open docs", onClick: onOpenDocs };
    }
    return null;
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>Component documentation progress</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          {stages.map((stage, idx) => {
            const isDone = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            return (
              <div key={stage} className="flex items-center">
                <div
                  className={[
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold",
                    isDone ? "border-status-success-border bg-status-success text-white" :
                    isCurrent ? "border-primary bg-primary text-primary-foreground" :
                    "border-border bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {isDone ? "✓" : idx + 1}
                </div>
                <span className="ml-2 text-xs hidden md:block">{STAGE_LABELS[stage]}</span>
                {idx < stages.length - 1 && (
                  <div className={["mx-1 h-0.5 w-8", isDone ? "bg-status-success" : "bg-border"].join(" ")} />
                )}
              </div>
            );
          })}
        </div>
        {cta && (
          <Button onClick={cta.onClick} size="sm">
            {cta.label}
          </Button>
        )}
        {!cta && (currentStage === "markdown" || currentStage === "render") && !hasFigmaUrl && (
          <p className="text-sm text-muted-foreground">
            Add a Figma URL to capture visual proof.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
