import type { ComponentRegistry } from "@/types/component-registry";
import type { ComponentUsageIndex } from "@/types/component-usage-index";
import type { TokenRegistry } from "@/types/token-registry";
import type { TokenCollectionTreeIndex } from "@/types/token-tree";
import type { TokenUsageIndex } from "@/types/token-usage-index";
import type { TokenGraphViz } from "@/types/token-graph";
import type { TokenHealthReport } from "@/types/token-health";
import type { ComponentsHealthReport } from "@/types/components-health";
import type { TokenDiffReport } from "@/types/token-diff";
import type { ImpactReport } from "@/types/impact";
import type { NamingDebtReport } from "@/types/naming-debt";
import type {
  CaptureHealthSnapshotResult,
  HealthHistoryBucket,
  HealthHistoryRange,
  HealthHistoryReport,
} from "@/types/health-history";
import type {
  ComponentSpecRestoreResponse,
  ComponentSpecSaveResponse,
  ComponentSpecValidateResponse,
} from "@/types/spec-editor";

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

export function fetchNamingDebt(args?: { refresh?: boolean }) {
  const params = new URLSearchParams();
  if (args?.refresh) params.set("refresh", "true");
  const suffix = params.size ? `?${params.toString()}` : "";
  return getJson<NamingDebtReport>(`/api/naming-debt${suffix}`);
}

export function fetchComponentsHealth() {
  return getJson<ComponentsHealthReport>("/api/components-health");
}

export function fetchHealthHistory(args?: {
  range?: HealthHistoryRange;
  bucket?: HealthHistoryBucket;
}) {
  const params = new URLSearchParams();
  if (args?.range) params.set("range", args.range);
  if (args?.bucket) params.set("bucket", args.bucket);
  const suffix = params.size ? `?${params.toString()}` : "";
  return getJson<HealthHistoryReport>(`/api/health-history${suffix}`);
}

export function fetchTokenDiff(beforeRef: string) {
  const params = new URLSearchParams({ beforeRef });
  return getJson<TokenDiffReport>(`/api/token-diff?${params.toString()}`);
}

export function fetchImpact(args: {
  tokenPath: string;
  newValue?: string | null;
  depth?: number;
}) {
  const params = new URLSearchParams({ tokenPath: args.tokenPath });
  if (args.newValue) params.set("newValue", args.newValue);
  if (typeof args.depth === "number" && Number.isFinite(args.depth)) {
    params.set("depth", String(args.depth));
  }
  return getJson<ImpactReport>(`/api/impact?${params.toString()}`);
}

export interface ComponentSpecPayload {
  ok: boolean;
  slug: string;
  path: string;
  exists: boolean;
  raw: string;
  rawHash: string | null;
  parsed: unknown;
  parseError?: string | null;
}

export function fetchComponentSpec(slug: string) {
  return getJson<ComponentSpecPayload>(
    `/api/component-spec/${encodeURIComponent(slug)}`,
  );
}

export function validateComponentSpecInput(args: { slug: string; raw: string }) {
  return getJson<ComponentSpecValidateResponse>(
    `/api/component-spec/${encodeURIComponent(args.slug)}/validate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: args.raw }),
    },
  );
}

export function saveComponentSpec(args: {
  slug: string;
  raw: string;
  expectedHash?: string | null;
  refreshRegistry?: boolean;
  confirmRiskyChanges?: boolean;
}) {
  return getJson<ComponentSpecSaveResponse>(
    `/api/component-spec/${encodeURIComponent(args.slug)}/save`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: args.raw,
        expectedHash: args.expectedHash ?? null,
        refreshRegistry: args.refreshRegistry !== false,
        confirmRiskyChanges: args.confirmRiskyChanges === true,
      }),
    },
  );
}

export function restoreComponentSpecBackup(args: {
  slug: string;
  refreshRegistry?: boolean;
}) {
  return getJson<ComponentSpecRestoreResponse>(
    `/api/component-spec/${encodeURIComponent(args.slug)}/restore-backup`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshRegistry: args.refreshRegistry !== false,
      }),
    },
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

export async function refreshNamingDebt() {
  return getJson<{
    ok: boolean;
    generatedAt: string;
    totalViolations: number;
    overallScore: number;
  }>("/api/refresh-naming-debt", { method: "POST" });
}

export async function captureHealthSnapshot(args?: {
  beforeRef?: string;
  retentionDays?: number;
  skipDiff?: boolean;
}) {
  return getJson<CaptureHealthSnapshotResult>("/api/capture-health-snapshot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args || {}),
  });
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

export interface CaptureFigmaScreenshotArgs {
  figmaUrl: string;
  componentSlug?: string;
  includeVariants?: boolean;
  variantLimit?: number;
  requireExistingDoc?: boolean;
  continueOnError?: boolean;
  refreshIndices?: boolean;
  dryRun?: boolean;
  scale?: number;
  format?: string;
  mainCaptureMode?: "auto" | "agent" | "rest";
  componentKind?: "component_set" | "component" | "all";
}

export interface CaptureFigmaScreenshotResult {
  ok: boolean;
  dryRun?: boolean;
  source?: {
    figma_url?: string;
    file_key?: string;
    node_id_from_url?: string | null;
  };
  requested?: {
    component_kind?: string;
    include_variants?: boolean;
    variant_limit?: number;
    scale?: number;
    format?: string;
    require_existing_doc?: boolean;
    main_capture_mode?: string;
  };
  total_candidates?: number;
  targets_total?: number;
  targets?: Array<{
    slug: string;
    node_id: string;
    kind?: string;
    page_name?: string | null;
    markdown_path: string;
    spec_path?: string;
    spec_exists?: boolean;
    figma_url?: string;
  }>;
  captured?: Array<{
    slug: string;
    node_id: string;
    markdown_path: string;
    proof_file_path?: string | null;
    screenshot_url?: string | null;
    local_image_path?: string | null;
    variants_count?: number;
  }>;
  failed?: Array<{
    slug: string;
    node_id: string;
    markdown_path: string;
    error: string;
  }>;
  skipped?: Array<Record<string, unknown>>;
  indices_refreshed?: boolean;
  registry_refresh?: {
    ok?: boolean;
    output?: string;
    stderr?: string;
  };
  error?: string;
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

export function captureFigmaScreenshot(
  args: CaptureFigmaScreenshotArgs,
) {
  return getJson<CaptureFigmaScreenshotResult>("/api/capture-figma-screenshot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
}
