import type { ComponentRegistry } from "@/types/component-registry";
import type { TokenRegistry } from "@/types/token-registry";
import type { TokenUsageIndex } from "@/types/token-usage-index";

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return (await response.json()) as T;
}

export function fetchComponentRegistry() {
  return getJson<ComponentRegistry>("/api/component-registry");
}

export function fetchTokenRegistry() {
  return getJson<TokenRegistry>("/api/token-registry");
}

export function fetchTokenUsageIndex() {
  return getJson<TokenUsageIndex>("/api/token-usage-index");
}

export async function refreshRegistry() {
  return getJson<{ ok: boolean; output?: string; stderr?: string }>(
    "/api/refresh-registry",
    { method: "POST" },
  );
}

export async function refreshTokenUsageIndex() {
  return getJson<{ ok: boolean; output?: string; stderr?: string }>(
    "/api/refresh-token-usage-index",
    { method: "POST" },
  );
}
