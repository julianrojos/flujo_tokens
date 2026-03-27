/**
 * Component Pipeline Section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
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
  const nextStage =
    currentIdx >= 0 && currentIdx < stages.length - 1
      ? stages[currentIdx + 1]
      : null;

  const cta = (() => {
    if (!currentStage) return null;
    if (currentStage === "missing-spec") return { label: "Create spec", onClick: onOpenSpec };
    if (currentStage === "spec") return { label: "Edit spec", onClick: onOpenSpec };
    if (currentStage === "markdown") {
      if (!hasFigmaUrl) return null;
      return { label: "Capture visual proof", onClick: onCapture };
    }
    if (currentStage === "visual-proof" && hasDocs) {
      return { label: "Open docs", onClick: onOpenDocs };
    }
    return null;
  })();

  const guidance = (() => {
    if (!currentStage) return null;

    if (currentStage === "markdown") {
      if (!hasFigmaUrl) {
        return {
          variant: "warning" as const,
          title: "Add a Figma URL to continue",
          description:
            "Documentation is generated, but visual proof cannot be captured until the component has a linked Figma source.",
        };
      }

      return {
        variant: "info" as const,
        title: "Ready for visual proof",
        description:
          "The markdown stage is complete. Capture visual proof to finish the component documentation pipeline.",
      };
    }

    if (currentStage === "visual-proof") {
      return {
        variant: "success" as const,
        title: "Pipeline complete",
        description:
          "Visual proof is available. Open docs to review and finalize publication status.",
      };
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
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Current: {currentStage ? STAGE_LABELS[currentStage] : "Unknown"}
          </span>
          {nextStage ? (
            <span className="ml-2">
              · Next: <span className="font-medium text-foreground">{STAGE_LABELS[nextStage]}</span>
            </span>
          ) : null}
        </div>
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
        {guidance ? (
          <StatusAlert
            variant={guidance.variant}
            title={guidance.title}
            description={guidance.description}
          />
        ) : null}
        {cta && (
          <Button onClick={cta.onClick} size="sm">
            {cta.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
