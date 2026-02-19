/**
 * Token value coercion helpers for typography and border dimensions.
 */

import type { TokenValue } from '../types/tokens.js';

export interface ParsedNumericValue {
    numeric: number;
    isUnitless: boolean;
    raw?: string;
}

export interface CoerceDimensionResult {
    value: TokenValue['$value'];
    varType: string | undefined;
}

function formatNumber(value: number): string {
    return value.toFixed(4).replace(/\.?0+$/, '');
}

function normalizePathSegmentForMatch(segment: string): string {
    return segment.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isBorderDimensionPath(currentPath: string[]): boolean {
    const normalized = currentPath.map(normalizePathSegmentForMatch);
    const hasBorderGroup =
        normalized.includes('border') &&
        (normalized.includes('radius') || normalized.includes('width') || normalized.includes('borderradius') || normalized.includes('borderwidth'));
    const hasDirectBorderMetric = normalized.some(segment => segment === 'borderradius' || segment === 'borderwidth');
    return hasBorderGroup || hasDirectBorderMetric;
}

function classifyTypographyDimensionPath(currentPath: string[]): { isSize: boolean; isLineHeight: boolean } {
    const normalized = currentPath.map(normalizePathSegmentForMatch);

    const hasFontSizeSegment = normalized.includes('fontsize');
    const hasLineHeightSegment = normalized.includes('lineheight');
    if (hasFontSizeSegment || hasLineHeightSegment) {
        return { isSize: hasFontSizeSegment, isLineHeight: hasLineHeightSegment };
    }

    const fontIdx = normalized.indexOf('font');
    if (fontIdx === -1 || fontIdx + 1 >= normalized.length) {
        return { isSize: false, isLineHeight: false };
    }

    const metric = normalized[fontIdx + 1];
    return { isSize: metric === 'size', isLineHeight: metric === 'lineheight' };
}

export function coerceNumericToRem(px: number): string {
    const rem = px / 16;
    return `${formatNumber(rem)}rem`;
}

export function coerceNumericToUnitless(px: number): string {
    const unitless = px / 16;
    return formatNumber(unitless);
}

export function parseNumericValue(value: string | number): ParsedNumericValue | undefined {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return undefined;
        return { numeric: value, isUnitless: true };
    }

    const trimmed = value.trim();
    const matchPx = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i);
    if (matchPx) {
        const numeric = parseFloat(matchPx[1]);
        if (!Number.isFinite(numeric)) return undefined;
        return { numeric, isUnitless: false };
    }

    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
        const numeric = parseFloat(trimmed);
        if (!Number.isFinite(numeric)) return undefined;
        return { numeric, isUnitless: true, raw: trimmed };
    }

    return undefined;
}

export function coerceFontSize(px: number): string {
    return coerceNumericToRem(px);
}

export function coerceLineHeight(px: number, isUnitless: boolean, rawUnitlessText?: string): string {
    // Keep small unitless ratios as-is (e.g. 1.2, 1.5).
    if (isUnitless && Math.abs(px) <= 4) {
        return rawUnitlessText ?? formatNumber(px);
    }

    return coerceNumericToUnitless(px);
}

export function coerceTypographyDimension(
    value: TokenValue['$value'],
    varType: string | undefined,
    currentPath: string[]
): CoerceDimensionResult {
    if (varType !== 'dimension') return { value, varType };

    const { isSize, isLineHeight } = classifyTypographyDimensionPath(currentPath);
    if (!isSize && !isLineHeight) return { value, varType };

    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = parseNumericValue(value);
        if (!parsed) return { value, varType };

        if (isSize) {
            return { value: coerceFontSize(parsed.numeric), varType };
        }

        if (isLineHeight) {
            return { value: coerceLineHeight(parsed.numeric, parsed.isUnitless, parsed.raw), varType };
        }
    }

    return { value, varType };
}

export function coerceBorderDimension(
    value: TokenValue['$value'],
    varType: string | undefined,
    currentPath: string[]
): CoerceDimensionResult {
    if (varType !== 'dimension') return { value, varType };
    if (!isBorderDimensionPath(currentPath)) return { value, varType };

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return { value, varType };
        return { value: `${formatNumber(value)}px`, varType };
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
            return { value: `${trimmed}px`, varType };
        }
    }

    return { value, varType };
}
