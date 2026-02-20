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

function safeJsonParse(rawText) {
  if (typeof rawText !== "string" || rawText.trim() === "") return null;
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
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

export function buildFigmaFileEndpoint({
  fileKey,
  depth,
  branchData = false,
  geometry = "",
} = {}) {
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

export async function fetchFigmaFile({
  fileKey,
  token,
  depth,
  branchData = false,
  geometry = "",
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
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

  const rawText = await response.text();
  const payload = safeJsonParse(rawText);

  if (!response.ok) {
    const details = buildErrorDetails(payload);
    const retryAfter = readRetryAfterSeconds(response);
    const retryHint = retryAfter !== null ? ` Retry after ${retryAfter}s.` : "";
    throw new Error(
      `Figma API error ${response.status} for ${endpoint}.${details ? ` ${details}.` : ""}${retryHint}`,
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new Error(`Figma API returned non-JSON response for ${endpoint}.`);
  }

  return payload;
}
