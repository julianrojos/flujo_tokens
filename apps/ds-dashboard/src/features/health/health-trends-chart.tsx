import { useMemo } from "react";

import type {
  HealthHistoryBucket,
  HealthHistorySnapshot,
} from "@/types/health-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type TrendPoint = {
  key: string;
  label: string;
  capturedAt: string;
  breakingChanges: number;
  wcagFailures: number;
  unresolved: number;
  coverage: number;
  unusedTokens: number;
};

type TrendLine = {
  label: string;
  color: string;
  value: (point: TrendPoint) => number;
};

function formatUtcDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

function startOfWeekIso(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return formatUtcDate(iso);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function toBucketKey(iso: string, bucket: HealthHistoryBucket) {
  return bucket === "week" ? startOfWeekIso(iso) : formatUtcDate(iso);
}

function buildTrendPoints(
  snapshots: HealthHistorySnapshot[],
  bucket: HealthHistoryBucket,
): TrendPoint[] {
  const byBucket = new Map<string, HealthHistorySnapshot>();
  const ordered = snapshots
    .slice()
    .sort((left, right) => left.captured_at.localeCompare(right.captured_at));

  for (const snapshot of ordered) {
    const key = toBucketKey(snapshot.captured_at, bucket);
    const previous = byBucket.get(key);
    if (!previous || previous.captured_at < snapshot.captured_at) {
      byBucket.set(key, snapshot);
    }
  }

  return Array.from(byBucket.entries())
    .map(([key, snapshot]) => ({
      key,
      label: key,
      capturedAt: snapshot.captured_at,
      breakingChanges:
        snapshot.metrics.breaking_changes === null ? 0 : snapshot.metrics.breaking_changes,
      wcagFailures: snapshot.metrics.wcag_failures_total,
      unresolved: snapshot.metrics.unresolved_total,
      coverage: snapshot.metrics.coverage_avg,
      unusedTokens: snapshot.metrics.unused_tokens_total,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function buildPolyline(
  points: TrendPoint[],
  valueForPoint: (point: TrendPoint) => number,
  width: number,
  height: number,
  maxY: number,
) {
  if (points.length === 0) return "";
  const leftPad = 36;
  const rightPad = 12;
  const topPad = 10;
  const bottomPad = 22;
  const chartWidth = Math.max(1, width - leftPad - rightPad);
  const chartHeight = Math.max(1, height - topPad - bottomPad);
  const divisor = Math.max(1, points.length - 1);

  const toX = (index: number) => leftPad + (index / divisor) * chartWidth;
  const toY = (value: number) =>
    topPad + chartHeight - (Math.max(0, value) / Math.max(1, maxY)) * chartHeight;

  return points
    .map((point, index) => `${toX(index)},${toY(valueForPoint(point))}`)
    .join(" ");
}

function NumericLineChart({
  points,
  lines,
  yMax,
  title,
  valueLabel,
}: {
  points: TrendPoint[];
  lines: TrendLine[];
  yMax: number;
  title: string;
  valueLabel: string;
}) {
  const width = 860;
  const height = 220;
  const safeMax = Math.max(1, yMax);
  const yTicks = [0, safeMax * 0.33, safeMax * 0.66, safeMax];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-titles font-semibold">{title}</h4>
        <span className="text-xs text-muted-foreground">{valueLabel}</span>
      </div>
      <div className="overflow-x-auto rounded border border-border/70 bg-background/60">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full min-w-[720px]">
          {yTicks.map((tick) => {
            const y = 10 + ((height - 32) * (1 - tick / safeMax));
            return (
              <g key={tick}>
                <line
                  x1={36}
                  y1={y}
                  x2={width - 12}
                  y2={y}
                  stroke="hsl(var(--border))"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={32}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px]"
                >
                  {Math.round(tick)}
                </text>
              </g>
            );
          })}

          {lines.map((line) => (
            <polyline
              key={line.label}
              points={buildPolyline(points, line.value, width, height, safeMax)}
              fill="none"
              stroke={line.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {points.map((point, index) => {
            const x =
              points.length <= 1
                ? 36
                : 36 + (index / Math.max(1, points.length - 1)) * (width - 48);
            return (
              <text
                key={point.key}
                x={x}
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {point.label.slice(5)}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        {lines.map((line) => (
          <Badge key={line.label} variant="neutral" className="gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: line.color }}
            />
            {line.label}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function HealthTrendsChart({
  snapshots,
  rangeLabel,
  bucket,
}: {
  snapshots: HealthHistorySnapshot[];
  rangeLabel: string;
  bucket: HealthHistoryBucket;
}) {
  const points = useMemo(() => buildTrendPoints(snapshots, bucket), [bucket, snapshots]);

  const riskMax = useMemo(() => {
    if (!points.length) return 1;
    return Math.max(
      1,
      ...points.map((point) =>
        Math.max(point.breakingChanges, point.wcagFailures, point.unresolved),
      ),
    );
  }, [points]);

  const latest = points[points.length - 1] || null;
  const oldest = points[0] || null;
  const deltaCoverage =
    latest && oldest ? Number((latest.coverage - oldest.coverage).toFixed(1)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical trends</CardTitle>
        <CardDescription>
          Snapshot evolution for {rangeLabel} ({bucket === "week" ? "weekly buckets" : "daily buckets"}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {points.length < 2 ? (
          <div className="text-sm text-muted-foreground">
            Not enough snapshots yet. Capture at least 2 snapshots to render trends.
          </div>
        ) : (
          <>
            <NumericLineChart
              points={points}
              yMax={riskMax}
              title="Risk metrics"
              valueLabel="count"
              lines={[
                {
                  label: "Breaking",
                  color: "#ef4444",
                  value: (point) => point.breakingChanges,
                },
                {
                  label: "WCAG failures",
                  color: "#f97316",
                  value: (point) => point.wcagFailures,
                },
                {
                  label: "Unresolved refs",
                  color: "#eab308",
                  value: (point) => point.unresolved,
                },
              ]}
            />

            <NumericLineChart
              points={points}
              yMax={100}
              title="Coverage trend"
              valueLabel="%"
              lines={[
                {
                  label: "Coverage avg",
                  color: "#3b82f6",
                  value: (point) => point.coverage,
                },
              ]}
            />

            {latest && oldest ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded border border-border/70 bg-background/60 p-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Coverage delta
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {deltaCoverage > 0 ? "+" : ""}
                    {deltaCoverage}%
                  </div>
                </div>
                <div className="rounded border border-border/70 bg-background/60 p-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Latest unresolved
                  </div>
                  <div className="mt-1 text-lg font-semibold">{latest.unresolved}</div>
                </div>
                <div className="rounded border border-border/70 bg-background/60 p-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Latest captured
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {new Date(latest.capturedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
