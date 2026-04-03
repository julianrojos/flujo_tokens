import { requestJson } from "@/lib/api";

export interface EditorialSuggestionResponse {
  ok: boolean;
  suggestion?: {
    id: number;
    patch: Record<string, unknown>;
  } | null;
}

export async function fetchEditorialSuggestion(slug: string): Promise<{
  id: number;
  patch: Record<string, unknown>;
} | null> {
  const data = await requestJson<EditorialSuggestionResponse>(
    `/api/component-spec/${encodeURIComponent(slug)}/editorial-suggestion`,
  );
  if (!data.ok || !data.suggestion) {
    return null;
  }
  return data.suggestion;
}

export async function discardEditorialSuggestion(slug: string): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/api/component-spec/${encodeURIComponent(slug)}/editorial-suggestion/discard`,
    { method: "POST" },
  );
}

export async function markEditorialSuggestionApplied(slug: string, suggestionId?: number): Promise<void> {
  await requestJson<{ ok: boolean }>(
    `/api/component-spec/${encodeURIComponent(slug)}/editorial-suggestion/mark-applied`,
    suggestionId !== undefined
      ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId }),
      }
      : { method: "POST" },
  );
}
