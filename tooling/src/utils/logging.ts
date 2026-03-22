export type DiagnosticLevel = 'info' | 'warn' | 'error';

const DIAGNOSTIC_PREFIX: Record<DiagnosticLevel, string> = {
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌'
};

export function formatDiagnostic(level: DiagnosticLevel, message: string): string {
    return `${DIAGNOSTIC_PREFIX[level]} ${message}`;
}
