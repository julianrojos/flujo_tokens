const FIGMA_API_BASE_URL = "https://api.figma.com";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaNode[];
  fills?: any[];
  strokes?: any[];
  effects?: any[];
  style?: any;
  absoluteBoundingBox?: { width: number; height: number };
  size?: { width: number; height: number };
  cornerRadius?: number;
  strokeWeight?: number;
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  primaryAxisSizingMode?: string;
  counterAxisSizingMode?: string;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  layoutGrow?: number;
  layoutAlign?: string;
  componentId?: string;
  componentPropertyDefinitions?: Record<string, any>;
}

export interface FigmaFileResponse {
  document: FigmaNode;
  components: Record<string, any>;
  componentSets: Record<string, any>;
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  role: string;
  editorType: string;
  linkAccess: string;
}

export interface FigmaNodesResponse {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
  role: string;
  editorType: string;
  linkAccess: string;
  nodes: Record<string, {
    document: FigmaNode;
    components: Record<string, any>;
    componentSets: Record<string, any>;
    schemaVersion: number;
  }>;
}

export interface FigmaApiOptions {
  token?: string;
  timeoutMs?: number;
}

export interface FetchFigmaFileOptions extends FigmaApiOptions {
  fileKey: string;
  depth?: string | number;
  branchData?: boolean;
  geometry?: string;
}

export interface FetchFigmaNodesOptions extends FigmaApiOptions {
  fileKey: string;
  nodeIds: string[] | string;
  depth?: string | number;
}

export interface FetchFigmaImagesOptions extends FigmaApiOptions {
  fileKey: string;
  nodeIds: string[] | string;
  format?: string;
  scale?: number | string;
}

/**
 * Normalize a value to a positive integer.
 */
export function normalizePositiveInteger(rawValue: unknown, fallback: number): number {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${rawValue}`);
  }
  if (parsed <= 0) {
    throw new Error(`Expected a positive integer. Received: ${rawValue}`);
  }
  return Math.floor(parsed);
}

/**
 * Sanitize and validate a Figma API token.
 */
export function sanitizeToken(rawToken: unknown): string {
  const token = String(rawToken || "").trim();
  if (!token) {
    throw new Error(
      "Missing Figma API token. Provide --token <token> or set FIGMA_TOKEN.",
    );
  }
  return token;
}

/**
 * Normalize and validate a Figma file key.
 */
export function normalizeFileKey(rawFileKey: unknown): string {
  const fileKey = String(rawFileKey || "").trim();
  if (!fileKey) {
    throw new Error("Missing Figma file key.");
  }
  return fileKey;
}

/**
 * Extract retry-after seconds from a response header.
 */
function readRetryAfterSeconds(response: Response): number | null {
  const headerValue = String(response.headers.get("retry-after") || "").trim();
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.floor(seconds);
}

/**
 * Build error details from a payload object.
 */
function buildErrorDetails(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const obj = payload as Record<string, unknown>;
  const err = String(obj.err || obj.error || "").trim();
  const msg = String(obj.message || "").trim();
  if (err && msg) return `${err}: ${msg}`;
  return err || msg;
}

/**
 * Resolve the global fetch function.
 */
function resolveFetch(): typeof fetch {
  if (typeof fetch !== "function") {
    throw new Error(
      "Global fetch is unavailable in this Node runtime. Use Node.js 18+.",
    );
  }
  return fetch;
}

/**
 * Make a request to the Figma API and parse JSON response.
 */
async function requestFigmaJson<T = unknown>(options: {
  endpointPath: string;
  token: string;
  query?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<T> {
  const { endpointPath, token, query = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const normalizedToken = sanitizeToken(token);
  const normalizedTimeoutMs = normalizePositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS);
  const apiUrl = new URL(endpointPath, FIGMA_API_BASE_URL);

  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    apiUrl.searchParams.set(key, String(value));
  }

  const runtimeFetch = resolveFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

  let response: Response;
  try {
    response = await runtimeFetch(apiUrl.toString(), {
      method: "GET",
      headers: {
        "X-Figma-Token": normalizedToken,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (String(reason).toLowerCase().includes("abort")) {
      throw new Error(
        `Figma request timed out after ${normalizedTimeoutMs}ms: ${apiUrl.toString()}`,
      );
    }
    throw new Error(`Figma request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const rawText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
    const details = buildErrorDetails(payload);
    const retryAfter = readRetryAfterSeconds(response);
    const retryHint = retryAfter !== null ? ` Retry after ${retryAfter}s.` : "";
    throw new Error(
      `Figma API error ${response.status} for ${apiUrl.toString()}.${details ? ` ${details}.` : ""}${retryHint}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Figma API returned non-JSON response for ${apiUrl.toString()}.`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error(`Figma API returned non-JSON response for ${apiUrl.toString()}.`);
  }
  return payload as T;
}

/**
 * Build a Figma file endpoint URL with query parameters.
 */
export function buildFigmaFileEndpoint(options: {
  fileKey: string;
  depth?: string | number;
  branchData?: boolean;
  geometry?: string;
}): string {
  const { fileKey, depth, branchData = false, geometry = "" } = options;
  const normalizedFileKey = normalizeFileKey(fileKey);
  const apiUrl = new URL(`/v1/files/${encodeURIComponent(normalizedFileKey)}`, FIGMA_API_BASE_URL);

  if (depth !== undefined && depth !== null && depth !== "") {
    const normalizedDepth = normalizePositiveInteger(depth, 0);
    if (normalizedDepth > 0) {
      apiUrl.searchParams.set("depth", String(normalizedDepth));
    }
  }
  if (String(branchData).trim().toLowerCase() === "true") {
    apiUrl.searchParams.set("branch_data", "true");
  }
  if (geometry) {
    apiUrl.searchParams.set("geometry", String(geometry));
  }
  return apiUrl.toString();
}

/**
 * Fetch a complete Figma file with document tree and components.
 */
export async function fetchFigmaFile(options: FetchFigmaFileOptions): Promise<FigmaFileResponse> {
  const {
    fileKey,
    token,
    depth,
    branchData = false,
    geometry = "",
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const endpointUrl = buildFigmaFileEndpoint({ fileKey, depth, branchData, geometry });
  // buildFigmaFileEndpoint returns a full URL; extract path+query for requestFigmaJson.
  const parsed = new URL(endpointUrl);
  const endpointPath = `${parsed.pathname}${parsed.search}`;

  return requestFigmaJson<FigmaFileResponse>({
    endpointPath,
    token,
    timeoutMs,
  });
}

/**
 * Fetch specific nodes from a Figma file.
 */
export async function fetchFigmaNodes(options: FetchFigmaNodesOptions): Promise<FigmaNodesResponse> {
  const { fileKey, nodeIds = [], token, depth, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const normalizedFileKey = normalizeFileKey(fileKey);

  const ids = Array.isArray(nodeIds)
    ? nodeIds
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(",")
    : String(nodeIds || "").trim();

  if (!ids) {
    throw new Error("Missing node ids for fetchFigmaNodes.");
  }

  const query: Record<string, string> = { ids };
  if (depth !== undefined && depth !== null && depth !== "") {
    const normalizedDepth = normalizePositiveInteger(depth, 0);
    if (normalizedDepth > 0) {
      query.depth = String(normalizedDepth);
    }
  }

  return requestFigmaJson<FigmaNodesResponse>({
    endpointPath: `/v1/files/${encodeURIComponent(normalizedFileKey)}/nodes`,
    token,
    query,
    timeoutMs,
  });
}

/**
 * Fetch local variables from a Figma file.
 */
export async function fetchFigmaLocalVariables(options: FigmaApiOptions & { fileKey: string }): Promise<unknown> {
  const { fileKey, token, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const normalizedFileKey = normalizeFileKey(fileKey);

  return requestFigmaJson({
    endpointPath: `/v1/files/${encodeURIComponent(normalizedFileKey)}/variables/local`,
    token,
    timeoutMs,
  });
}

/**
 * Fetch image URLs for specific nodes from a Figma file.
 */
export async function fetchFigmaImages(options: FetchFigmaImagesOptions): Promise<unknown> {
  const {
    fileKey,
    nodeIds = [],
    token,
    format = "png",
    scale,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const normalizedFileKey = normalizeFileKey(fileKey);
  const ids = Array.isArray(nodeIds)
    ? nodeIds
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(",")
    : String(nodeIds || "").trim();

  if (!ids) {
    throw new Error("Missing node ids for fetchFigmaImages.");
  }

  const query: Record<string, string> = {
    ids,
    format: String(format || "png").trim().toLowerCase(),
  };

  if (scale !== undefined && scale !== null && scale !== "") {
    const parsedScale = Number(scale);
    if (!Number.isFinite(parsedScale) || parsedScale <= 0) {
      throw new Error(`Invalid scale value for fetchFigmaImages: ${scale}`);
    }
    query.scale = String(parsedScale);
  }

  return requestFigmaJson({
    endpointPath: `/v1/images/${encodeURIComponent(normalizedFileKey)}`,
    token,
    query,
    timeoutMs,
  });
}
