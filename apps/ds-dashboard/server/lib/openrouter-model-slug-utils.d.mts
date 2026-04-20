import type { OpenRouterModelSuggestion } from '../../shared/openrouter-types.js';

export declare const MAX_OPENROUTER_SUGGESTIONS: 20;
export type { OpenRouterModelSuggestion };
export declare function decodeOpenRouterSlug(rawSlug: string | null | undefined): string;
export declare function isValidOpenRouterModelSlug(slug: string | null | undefined): boolean;
export declare function extractTopOpenRouterModelSlugs(html: string | null | undefined, limit?: number): string[];
export declare function fallbackLabelFromSlug(slug: string | null | undefined): string;
