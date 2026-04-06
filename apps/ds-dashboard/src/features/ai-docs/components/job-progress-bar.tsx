/**
 * JobProgressBar Component
 *
 * Visual progress bar with phase label. No calculation logic — pure render.
 */

import { useId } from 'react';

interface JobProgressBarProps {
    /** Progress percentage 0–100 */
    percent: number;
    /** Human-readable phase label */
    label: string;
}

export function JobProgressBar({ percent, label }: JobProgressBarProps) {
    const clampedPercent = Math.min(100, Math.max(0, percent));
    const labelId = useId();

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span id={labelId} className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{clampedPercent}%</span>
            </div>
            <div
                role="progressbar"
                aria-labelledby={labelId}
                aria-valuetext={`${clampedPercent}%`}
                aria-valuenow={clampedPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
                <div
                    className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                    style={{ width: `${clampedPercent}%` }}
                />
            </div>
        </div>
    );
}
