/**
 * Shared validation types for AI pipeline stage 3.
 * This module is intentionally framework-agnostic so it can be consumed
 * from both server and frontend without crossing architecture layers.
 */

export type ValidationSeverity = 'blocking' | 'warning' | 'info';

export interface StructureWarning {
    message: string;
    severity: ValidationSeverity;
    section: string;
}

export interface MissingSection {
    section: string;
    reason: string;
    severity: ValidationSeverity;
}

export interface UnsupportedClaim {
    claim: string;
    evidence: string;
    source: 'extraction' | 'editorial';
    severity: ValidationSeverity;
}

export interface EditorialConflict {
    extraction: string;
    editorial: string;
    severity: ValidationSeverity;
}

export interface TerminologyMismatch {
    used: string;
    expected: string;
    location: string;
}

export interface A11yWarning {
    message: string;
    severity: ValidationSeverity;
    wcagCriterion?: string;
}

export interface ValidationReport {
    schemaVersion: number;
    passes: boolean;
    severity: ValidationSeverity;
    score: number;
    structureWarnings: StructureWarning[];
    missingSections: MissingSection[];
    unsupportedClaims: UnsupportedClaim[];
    editorialConflicts: EditorialConflict[];
    terminologyMismatches: TerminologyMismatch[];
    a11yWarnings: A11yWarning[];
    notes: string[];
}
