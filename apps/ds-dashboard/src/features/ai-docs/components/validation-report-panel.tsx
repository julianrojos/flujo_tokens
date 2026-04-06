/**
 * Validation Report Panel
 * Displays the quality assessment from the 3rd pipeline stage.
 * Shows score badge, severity, and grouped issue lists.
 */

import type { ValidationReport, ValidationSeverity } from '@/types/ai-jobs';

interface ValidationReportPanelProps {
    report: ValidationReport | undefined;
    canPublish: boolean | undefined;
    jobStatus?: string;
    pipelineStage?: 'extracting' | 'patching' | 'validating' | null;
    showFailOpenNotice?: boolean;
}

const severityColors: Record<ValidationSeverity, { bg: string; text: string; label: string }> = {
    blocking: { bg: 'bg-red-100', text: 'text-red-800', label: 'Blocking' },
    warning: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Warning' },
    info: { bg: 'bg-green-100', text: 'text-green-800', label: 'Info' },
};

function scoreColor(score: number): string {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
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
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm text-gray-600">
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
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-500">
                    Validation report not available.
                </p>
            </div>
        );
    }

    const sev = severityColors[report.severity];

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-3">
                <h3 className="text-sm font-semibold text-gray-900">Quality Assessment</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sev.bg} ${sev.text}`}>
                    {sev.label}
                </span>
                <span className={`text-lg font-bold ${scoreColor(report.score)}`}>
                    {report.score}/100
                </span>
                {!canPublish && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                        Cannot publish
                    </span>
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
                <div className="mt-2 text-xs text-gray-500">
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
        blocking: 'border-l-red-500',
        warning: 'border-l-yellow-500',
        info: 'border-l-blue-500',
    };

    return (
        <div className={`mb-2 border-l-4 ${borderColors[severity]} pl-3`}>
            <h4 className="text-xs font-medium text-gray-700">{title}</h4>
            <ul className="mt-1 list-inside list-disc text-xs text-gray-600">
                {items.slice(0, 5).map((item, i) => (
                    <li key={i}>{item}</li>
                ))}
                {items.length > 5 && (
                    <li className="text-gray-400">+{items.length - 5} more</li>
                )}
            </ul>
        </div>
    );
}
