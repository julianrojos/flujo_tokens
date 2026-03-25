import { cn } from "@/lib/utils";

export interface AdoptionBarProps {
  dsCount: number;
  nonDsCount: number | null | undefined;
  className?: string;
  barClassName?: string;
}

/**
 * AdoptionBar — Feature component for Consumers feature (Tier 2)
 * 
 * Renders a segmented progress bar showing DS vs Non-DS adoption.
 * Returns null when data is unavailable or total is zero (caller renders fallback).
 * 
 * @param dsCount - Number of DS-resolved items (components or variables)
 * @param nonDsCount - Number of non-DS items (local + other libraries), or null if unavailable
 * @param className - Optional container className overrides
 * @param barClassName - Optional bar className overrides (e.g., "h-2" for detail page)
 */
export function AdoptionBar({ dsCount, nonDsCount, className, barClassName }: AdoptionBarProps) {
  // Return null when data unavailable or total = 0 (caller handles fallback)
  if (nonDsCount == null) return null;
  const total = dsCount + nonDsCount;
  if (total === 0) return null;

  const pct = Math.max(0, Math.min(100, (dsCount / total) * 100));
  const nonDsPct = Math.max(0, 100 - pct);
  const pctText = `${Math.round(pct)}%`;

  // Semantic color for percentage text (no raw palette classes)
  const colorClass =
    pct >= 80 ? "text-status-success" : pct >= 50 ? "text-status-warning" : "text-status-error";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn("relative flex h-1.5 flex-1 overflow-hidden rounded-full bg-muted", barClassName)}
        role="progressbar"
        aria-label="DS adoption"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* DS segment — uses app-accent token */}
        <div
          className="h-full bg-app-accent transition-[width] duration-base"
          style={{ width: `${pct}%` }}
        />
        {/* Non-DS segment — uses muted background */}
        <div
          className="h-full bg-muted transition-[width] duration-base"
          style={{ width: `${nonDsPct}%` }}
        />
      </div>
      <span className={cn("w-9 shrink-0 text-right text-xs tabular-nums", colorClass)}>
        {pctText}
      </span>
    </div>
  );
}
