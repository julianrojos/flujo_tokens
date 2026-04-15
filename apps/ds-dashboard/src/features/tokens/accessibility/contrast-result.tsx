import { Badge } from "@/components/ui/badge";
import { StatusAlert } from "@/components/ui/status-alert";

import type { ContrastCheckResult } from "./types";

interface ContrastResultProps {
  result: ContrastCheckResult | null;
}

function statusBadge(passes: boolean | null) {
  if (passes === true) return <Badge variant="success">Pass</Badge>;
  if (passes === false) return <Badge variant="warning">Fail</Badge>;
  return <Badge variant="neutral">Info</Badge>;
}

function contextLabel(result: ContrastCheckResult): string {
  if (result.context.elementType === "icon") return "Icon / UI";
  if (result.context.textSize === "large") return "Large text";
  return "Normal text";
}

export function ContrastResult({ result }: ContrastResultProps) {
  if (!result) {
    return (
      <StatusAlert variant="warning" description="Select colors and foreground element type to evaluate contrast." />
    );
  }

  return (
    <div className="rounded border border-border/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">WCAG 2.2 Contrast</p>
        <Badge variant="neutral">{result.ratio.toFixed(2)} : 1</Badge>
      </div>

      <p className="mb-2 text-xs text-muted-foreground">
        Applied context: <span className="font-semibold text-foreground">{contextLabel(result)}</span>
      </p>

      <div className="grid gap-2 text-sm">
        <div className="rounded-md bg-muted/50 p-2">
          <p className="font-semibold">Level AA</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span>
              {result.aa.requiredRatio !== null
                ? `Required >= ${result.aa.requiredRatio}:1`
                : "No threshold"}
            </span>
            {statusBadge(result.aa.passes)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{result.aa.criterion}</p>
        </div>

        <div className="rounded-md bg-muted/50 p-2">
          <p className="font-semibold">Level AAA</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span>
              {result.aaa.requiredRatio !== null
                ? `Required >= ${result.aaa.requiredRatio}:1`
                : "No dedicated AAA threshold for this context"}
            </span>
            {statusBadge(result.aaa.passes)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{result.aaa.criterion}</p>
        </div>
      </div>
    </div>
  );
}
