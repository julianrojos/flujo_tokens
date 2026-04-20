export declare const MAX_OPENROUTER_SUGGESTIONS: 20;
export interface OpenRouterModelSuggestion {
  value: string;
  label: string;
  hint: string;
}
export declare function decodeOpenRouterSlug(rawSlug: string | null | undefined): string;
export declare function isValidOpenRouterModelSlug(slug: string | null | undefined): boolean;
export declare function extractTopOpenRouterModelSlugs(html: string | null | undefined, limit?: number): string[];
export declare function fallbackLabelFromSlug(slug: string | null | undefined): string;
