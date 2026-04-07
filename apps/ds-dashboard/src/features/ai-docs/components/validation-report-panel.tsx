/**
 * Validation Report Panel
 * Displays the quality assessment from the 3rd pipeline stage.
 * Shows score badge, severity, and grouped issue lists.
 */

import type { ValidationReport, ValidationSeverity } from '@/types/ai-jobs';
import { Badge } from '@/components/ui/badge';

interface ValidationReportPanelProps {
    report: ValidationReport | undefined;
    canPublish: boolean | undefined;
    jobStatus?: string;
    pipelineStage?: 'extracting' | 'patching' | 'validating' | null;
    showFailOpenNotice?: boolean;
}

const severityBadgeVariant: Record<ValidationSeverity, 'error' | 'warning' | 'neutral'> = {
    blocking: 'error',
    warning: 'warning',
    info: 'neutral',
};

function scoreColor(score: number): string {
    if (score >= 80) return 'text-status-success';
    if (score >= 50) return 'text-status-warning';
    return 'text-status-error';
}

export function ValidationReportPanel({
    report,
    canPublish,
    jobStatus,
    pipelineStage,
    showFailOpenNotice = false,
}: ValidationReportPanelProps) {
    if (!report) {
        // Do not render while validation is still pending/in-progress.
        if (jobStatus !== 'completed' || pipelineStage) {
            return null;
        }

        // Show fail-open notice only when validation was attempted and failed.
        if (showFailOpenNotice) {
            return (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">
                        Validation not available (fail-open).
                    </p>
                </div>
            );
        }

        // If validation was disabled/skipped by user, show nothing.
        if (canPublish !== false) {
            return null;
        }

        return (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                    Validation report not available.
                </p>
            </div>
        );
    }

    const severityLabel = report.severity === 'blocking'
        ? 'Blocking'
        : report.severity === 'warning'
            ? 'Warning'
            : 'Info';

    return (
        <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-3">
                <h3 className="text-sm font-semibold text-foreground">Quality Assessment</h3>
                <Badge variant={severityBadgeVariant[report.severity]}>
                    {severityLabel}
                </Badge>
                <span className={`text-lg font-bold ${scoreColor(report.score)}`}>
                    {report.score}/100
                </span>
                {!canPublish && (
                    <Badge variant="error">
                        Cannot publish
                    </Badge>
                )}
            </div>

            {report.structureWarnings.length > 0 && (
                <SectionList title="Structure Warnings" severity="warning" items={report.structureWarnings.map(w => w.message)} />
            )}
            {report.missingSections.length > 0 && (
                <SectionList title="Missing Sections" severity="warning" items={report.missingSections.map(s => `${s.section}: ${s.reason}`)} />
            )}
            {report.unsupportedClaims.length > 0 && (
                <SectionList title="Unsupported Claims" severity="warning" items={report.unsupportedClaims.map(c => c.claim)} />
            )}
            {report.editorialConflicts.length > 0 && (
                <SectionList title="Editorial Conflicts" severity="blocking" items={report.editorialConflicts.map(c => `${c.extraction} vs ${c.editorial}`)} />
            )}
            {report.terminologyMismatches.length > 0 && (
                <SectionList title="Terminology Mismatches" severity="info" items={report.terminologyMismatches.map(t => `Used "${t.used}", expected "${t.expected}"`)} />
            )}
            {report.a11yWarnings.length > 0 && (
                <SectionList title="Accessibility Warnings" severity="warning" items={report.a11yWarnings.map(a => a.message)} />
            )}
            {report.tokenWarnings.length > 0 && (
                <SectionList title="Token Warnings" severity="info" items={report.tokenWarnings.map(t => t.message)} />
            )}
            {report.notes.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                    {report.notes.map((note, i) => (
                        <p key={i}>{note}</p>
                    ))}
                </div>
            )}
        </div>
    );
}

function SectionList({ title, severity, items }: { title: string; severity: ValidationSeverity; items: string[] }) {
    const borderColors: Record<ValidationSeverity, string> = {
        blocking: 'border-l-status-error-border',
        warning: 'border-l-status-warning-border',
        info: 'border-l-status-success-border',
    };

    return (
        <div className={`mb-2 border-l-4 ${borderColors[severity]} pl-3`}>
            <h4 className="text-xs font-medium text-foreground">{title}</h4>
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                {items.slice(0, 5).map((item, i) => (
                    <li key={i}>{item}</li>
                ))}
                {items.length > 5 && (
                    <li className="text-muted-foreground/70">+{items.length - 5} more</li>
                )}
            </ul>
        </div>
    );
}
