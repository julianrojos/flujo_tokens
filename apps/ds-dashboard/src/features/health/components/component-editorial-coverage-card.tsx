import { useEffect, useMemo, useRef, useState } from "react";
import { arc, easeCubicOut, interpolateNumber } from "d3";
import { useParams } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";
import { useComponentCatalogQuery } from "../use-health-queries";

const RADIUS = 78;
const INNER_RADIUS = 58;
const SIZE = 200;
const CENTER = SIZE / 2;
const TAU = Math.PI * 2;

function formatFraction(value: number, total: number): string {
  return `${value} / ${total}`;
}

function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ComponentEditorialCoverageCard() {
  const { systemId } = useParams<{ systemId: string }>();
  const resolvedSystemId = String(systemId || "").trim();
  const { data, isLoading, isError } = useComponentCatalogQuery(resolvedSystemId);

  const totalComponents = data?.summary.total_components ?? 0;
  const docsCreated = data?.summary.with_editorial ?? 0;
  const targetProgress = totalComponents > 0 ? docsCreated / totalComponents : 0;
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const prevProgressRef = useRef(0);

  useEffect(() => {
    const from = prevProgressRef.current;
    const to = targetProgress;
    if (from === to) return;

    const tween = interpolateNumber(from, to);
    const durationMs = 700;
    const startedAt = performance.now();
    let frameId = 0;

    const step = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeCubicOut(elapsed);
      setAnimatedProgress(tween(eased));
      if (elapsed < 1) {
        frameId = window.requestAnimationFrame(step);
        return;
      }
      prevProgressRef.current = to;
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [targetProgress]);

  const arcGenerator = useMemo(
    () =>
      arc<{ startAngle: number; endAngle: number }>()
        .innerRadius(INNER_RADIUS)
        .outerRadius(RADIUS)
        .cornerRadius(8),
    [],
  );

  const trackPath = useMemo(
    () =>
      arcGenerator({
        startAngle: 0,
        endAngle: TAU,
      }),
    [arcGenerator],
  );
  const fillPath = arcGenerator({
    startAngle: 0,
    endAngle: TAU * animatedProgress,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Componentes documentados</CardTitle>
          <CardDescription>Loading documentation coverage.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[240px] animate-pulse rounded-xl bg-muted/60" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Componentes documentados</CardTitle>
          <CardDescription>Documentation coverage unavailable.</CardDescription>
        </CardHeader>
        <CardContent>
          <StatusAlert variant="warning" title="Documentation coverage unavailable">
            Could not load the component docs summary.
          </StatusAlert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:max-w-none">
      <CardHeader>
        <CardTitle>Componentes documentados</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        {totalComponents > 0 ? (
          <div className="relative flex h-[240px] w-full items-center justify-center">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label={`Documentation coverage ${formatFraction(docsCreated, totalComponents)} (${formatPercentage(targetProgress)})`}
              className="h-[240px] w-[240px]"
            >
              <g transform={`translate(${CENTER}, ${CENTER})`}>
                <path d={trackPath || undefined} className="fill-surface-2 stroke-border/70" />
                <path d={fillPath || undefined} className="fill-accent" />
              </g>
            </svg>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-3xl font-titles font-semibold tracking-tight text-foreground">
                {formatFraction(docsCreated, totalComponents)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {formatPercentage(targetProgress)} documented
              </div>
            </div>
          </div>
        ) : (
          <StatusAlert variant="success" title="No components yet">
            There are no components to document for this system.
          </StatusAlert>
        )}
      </CardContent>
    </Card>
  );
}
