import type { ComponentRegistry } from "@/types/component-registry";
import type { ComponentUsageIndex } from "@/types/component-usage-index";
import type { TokenRegistry } from "@/types/token-registry";
import type { TokenCollectionTreeIndex } from "@/types/token-tree";
import type { TokenUsageIndex } from "@/types/token-usage-index";
import type { TokenGraphViz } from "@/types/token-graph";
import type { TokenHealthReport } from "@/types/token-health";
import type { ComponentsHealthReport } from "@/types/components-health";
import type { TokenDiffReport } from "@/types/token-diff";

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

export function fetchComponentUsageIndex() {
  return getJson<ComponentUsageIndex>("/api/component-usage-index");
}

export function fetchTokenRegistry() {
  return getJson<TokenRegistry>("/api/token-registry");
}

export function fetchTokenCollectionTrees() {
  return getJson<TokenCollectionTreeIndex>("/api/token-collection-trees");
}

export function fetchTokenUsageIndex() {
  return getJson<TokenUsageIndex>("/api/token-usage-index");
}

export function fetchTokenGraph() {
  return getJson<TokenGraphViz>("/api/token-graph");
}

export function fetchTokenHealth() {
  return getJson<TokenHealthReport>("/api/token-health");
}

export function fetchComponentsHealth() {
  return getJson<ComponentsHealthReport>("/api/components-health");
}

export function fetchTokenDiff(beforeRef: string) {
  const params = new URLSearchParams({ beforeRef });
  return getJson<TokenDiffReport>(`/api/token-diff?${params.toString()}`);
}

export interface ComponentSpecPayload {
  ok: boolean;
  slug: string;
  path: string;
  raw: string;
  parsed: unknown;
}

export function fetchComponentSpec(slug: string) {
  return getJson<ComponentSpecPayload>(
    `/api/component-spec/${encodeURIComponent(slug)}`,
  );
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

export async function refreshTokenGraph() {
  return getJson<{ ok: boolean; output?: string; stderr?: string }>(
    "/api/refresh-token-graph",
    { method: "POST" },
  );
}

export async function refreshTokenHealth() {
  return getJson<{ ok: boolean; output?: string; stderr?: string }>(
    "/api/refresh-token-health",
    { method: "POST" },
  );
}

export async function refreshComponentsHealth() {
  return getJson<{ ok: boolean; output?: string; stderr?: string }>(
    "/api/refresh-components-health",
    { method: "POST" },
  );
}

export interface FilePayload {
  ok: boolean;
  file: string;
  truncated?: boolean;
  content: string;
}

export interface FileSnippetPayload {
  ok: boolean;
  file: string;
  line: number;
  startLine: number;
  endLine: number;
  matchedBy: "line" | "query";
  snippet: string;
}

export function fetchFile(filePath: string) {
  const params = new URLSearchParams({ path: filePath });
  return getJson<FilePayload>(`/api/file?${params.toString()}`);
}

export function fetchFileSnippet(args: {
  file: string;
  line?: number;
  q?: string;
  before?: number;
  after?: number;
}) {
  const params = new URLSearchParams({ file: args.file });
  if (args.line) params.set("line", String(args.line));
  if (args.q) params.set("q", args.q);
  if (args.before !== undefined) params.set("before", String(args.before));
  if (args.after !== undefined) params.set("after", String(args.after));
  return getJson<FileSnippetPayload>(`/api/file-snippet?${params.toString()}`);
}
