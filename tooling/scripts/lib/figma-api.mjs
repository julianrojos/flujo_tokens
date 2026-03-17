/**
 * @typedef {Object} FigmaColor
 * @property {number} r
 * @property {number} g
 * @property {number} b
 * @property {number} [a]
 */

/**
 * @typedef {Object} FigmaNode
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {boolean} [visible]
 * @property {FigmaNode[]} [children]
 * @property {any[]} [fills]
 * @property {any[]} [strokes]
 * @property {any[]} [effects]
 * @property {Object} [style]
 * @property {Object} [absoluteBoundingBox]
 * @property {number} [absoluteBoundingBox.width]
 * @property {number} [absoluteBoundingBox.height]
 * @property {Object} [size]
 * @property {number} [size.width]
 * @property {number} [size.height]
 * @property {number} [cornerRadius]
 * @property {number} [strokeWeight]
 * @property {string} [layoutMode]
 * @property {string} [primaryAxisAlignItems]
 * @property {string} [counterAxisAlignItems]
 * @property {string} [primaryAxisSizingMode]
 * @property {string} [counterAxisSizingMode]
 * @property {number} [itemSpacing]
 * @property {number} [paddingTop]
 * @property {number} [paddingRight]
 * @property {number} [paddingBottom]
 * @property {number} [paddingLeft]
 * @property {number} [layoutGrow]
 * @property {string} [layoutAlign]
 * @property {string} [componentId]
 * @property {Record<string, any>} [componentPropertyDefinitions]
 */

/**
 * @typedef {Object} FigmaFileResponse
 * @property {FigmaNode} document
 * @property {Record<string, any>} components
 * @property {Record<string, any>} componentSets
 * @property {string} name
 * @property {string} lastModified
 * @property {string} thumbnailUrl
 * @property {string} version
 * @property {string} role
 * @property {string} editorType
 * @property {string} linkAccess
 */

/**
 * @typedef {Object} FigmaNodesResponse
 * @property {string} name
 * @property {string} lastModified
 * @property {string} thumbnailUrl
 * @property {string} version
 * @property {string} role
 * @property {string} editorType
 * @property {string} linkAccess
 * @property {Record<string, { document: FigmaNode, components: Record<string, any>, componentSets: Record<string, any>, schemaVersion: number }>} nodes
 */

const FIGMA_API_BASE_URL = "https://api.figma.com";
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizePositiveInteger(rawValue, fallback) {
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

function sanitizeToken(rawToken) {
  const token = String(rawToken || "").trim();
  if (!token) {
    throw new Error(
      "Missing Figma API token. Provide --token <token> or set FIGMA_TOKEN.",
    );
  }
  return token;
}

function normalizeFileKey(rawFileKey) {
  const fileKey = String(rawFileKey || "").trim();
  if (!fileKey) {
    throw new Error("Missing Figma file key.");
  }
  return fileKey;
}

function readRetryAfterSeconds(response) {
  const headerValue = String(response.headers.get("retry-after") || "").trim();
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.floor(seconds);
}

function buildErrorDetails(payload) {
  if (!payload || typeof payload !== "object") return "";
  const err = String(payload.err || payload.error || "").trim();
  const msg = String(payload.message || "").trim();
  if (err && msg) return `${err}: ${msg}`;
  return err || msg;
}

function resolveFetch() {
  if (typeof fetch !== "function") {
    throw new Error(
      "Global fetch is unavailable in this Node runtime. Use Node.js 18+.",
    );
  }
  return fetch;
}

/**
 * @param {Object} args
 * @param {string} args.endpointPath
 * @param {string} args.token
 * @param {Record<string, any>} [args.query]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<any>}
 */
async function requestFigmaJson({
  endpointPath,
  token,
  query = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const normalizedToken = sanitizeToken(token);
  const normalizedTimeoutMs = normalizePositiveInteger(
    timeoutMs,
    DEFAULT_TIMEOUT_MS,
  );
  const apiUrl = new URL(endpointPath, FIGMA_API_BASE_URL);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    apiUrl.searchParams.set(key, String(value));
  }

  const runtimeFetch = resolveFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

  let response;
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
    let payload;
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
  // Use response.json() directly — avoids creating full text string in memory
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Figma API returned non-JSON response for ${apiUrl.toString()}.`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error(`Figma API returned non-JSON response for ${apiUrl.toString()}.`);
  }
  return payload;
}

/**
 * @param {Object} args
 * @param {string} args.fileKey
 * @param {string|number} [args.depth]
 * @param {boolean} [args.branchData]
 * @param {string} [args.geometry]
 * @returns {string}
 */
export function buildFigmaFileEndpoint({
  fileKey,
  depth,
  branchData = false,
  geometry = "",
}) {
  const normalizedFileKey = normalizeFileKey(fileKey);
  const apiUrl = new URL(`/v1/files/${encodeURIComponent(normalizedFileKey)}`, FIGMA_API_BASE_URL);

  if (depth !== undefined && depth !== null && depth !== "") {
    apiUrl.searchParams.set(
      "depth",
      String(normalizePositiveInteger(depth, undefined)),
    );
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
 * @param {Object} args
 * @param {string} args.fileKey
 * @param {string} args.token
 * @param {string|number} [args.depth]
 * @param {boolean} [args.branchData]
 * @param {string} [args.geometry]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<FigmaFileResponse>}
 */
export async function fetchFigmaFile({
  fileKey,
  token,
  depth,
  branchData = false,
  geometry = "",
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const normalizedToken = sanitizeToken(token);
  const endpoint = buildFigmaFileEndpoint({
    fileKey,
    depth,
    branchData,
    geometry,
  });
  const normalizedTimeoutMs = normalizePositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS);
  const runtimeFetch = resolveFetch();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

  let response;
  try {
    response = await runtimeFetch(endpoint, {
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
        `Figma request timed out after ${normalizedTimeoutMs}ms: ${endpoint}`,
      );
    }
    throw new Error(`Figma request failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const rawText = await response.text();
    let payload;
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
    const details = buildErrorDetails(payload);
    const retryAfter = readRetryAfterSeconds(response);
    const retryHint = retryAfter !== null ? ` Retry after ${retryAfter}s.` : "";
    throw new Error(
      `Figma API error ${response.status} for ${endpoint}.${details ? ` ${details}.` : ""}${retryHint}`,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Figma API returned non-JSON response for ${endpoint}.`);
  }
  if (!payload || typeof payload !== "object") {
    throw new Error(`Figma API returned non-JSON response for ${endpoint}.`);
  }

  return payload;
}

/**
 * @param {Object} args
 * @param {string} args.fileKey
 * @param {string[]|string} args.nodeIds
 * @param {string} args.token
 * @param {string|number} [args.depth]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<FigmaNodesResponse>}
 */
export async function fetchFigmaNodes({
  fileKey,
  nodeIds = [],
  token,
  depth,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
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

  const query = { ids };
  if (depth !== undefined && depth !== null && depth !== "") {
    query.depth = String(normalizePositiveInteger(depth, undefined));
  }

  return requestFigmaJson({
    endpointPath: `/v1/files/${encodeURIComponent(normalizedFileKey)}/nodes`,
    token,
    query,
    timeoutMs,
  });
}

/**
 * @param {Object} args
 * @param {string} args.fileKey
 * @param {string} args.token
 * @param {number} [args.timeoutMs]
 * @returns {Promise<any>}
 */
export async function fetchFigmaLocalVariables({
  fileKey,
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const normalizedFileKey = normalizeFileKey(fileKey);
  return requestFigmaJson({
    endpointPath: `/v1/files/${encodeURIComponent(
      normalizedFileKey,
    )}/variables/local`,
    token,
    timeoutMs,
  });
}

/**
 * @param {Object} args
 * @param {string} args.fileKey
 * @param {string[]|string} args.nodeIds
 * @param {string} args.token
 * @param {string} [args.format]
 * @param {number|string} [args.scale]
 * @param {number} [args.timeoutMs]
 * @returns {Promise<any>}
 */
export async function fetchFigmaImages({
  fileKey,
  nodeIds = [],
  token,
  format = "png",
  scale,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
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

  const query = {
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
