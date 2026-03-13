import { resolveEnvRef } from "../lib/env-ref-utils.ts";

/**
 * POST /api/figma-ping
 *
 * Lightweight pre-flight check: verifies that a Figma token can read a file
 * before the user submits the full creation form.
 *
 * Body:  { figmaUrl: string, figmaToken: string }
 * Returns (always HTTP 200 for Figma-level errors, 400 for bad requests):
 *   { ok: true,  fileName: string, fileKey: string }
 *   { ok: false, code: string,     message: string, fileKey?: string }
 *
 * Runs synchronously — does NOT enqueue a queue job.
 */

const DEFAULT_FIGMA_API_TIMEOUT_MS = 8_000;

function resolveFigmaApiTimeoutMs(rawValue) {
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_FIGMA_API_TIMEOUT_MS;
}

const FIGMA_API_TIMEOUT_MS = resolveFigmaApiTimeoutMs(process.env.FIGMA_PING_TIMEOUT_MS);

function parseFigmaUrl(figmaUrl) {
  try {
    const parsed = new URL(figmaUrl);
    const host = String(parsed.hostname || "").trim().toLowerCase();
    const hostValid = host === "figma.com" || host.endsWith(".figma.com");
    const segments = parsed.pathname.split("/").filter(Boolean);
    let fileKey = "";
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === "file" || segments[i] === "design") {
        fileKey = segments[i + 1] || "";
        break;
      }
    }
    return { ok: true, hostValid, fileKey };
  } catch {
    return { ok: false, hostValid: false, fileKey: "" };
  }
}

/**
 * Resolves a token value that may be a literal token or an env-var reference.
 *   "figd_..."          → returned as-is
 *   "${FIGMA_TOKEN}"    → resolves process.env.FIGMA_TOKEN
 *   "$FIGMA_TOKEN"      → resolves process.env.FIGMA_TOKEN
 *   "FIGMA_TOKEN"       → resolves process.env.FIGMA_TOKEN if set, otherwise literal
 */
function resolveTokenValue(raw) {
  return resolveEnvRef(raw);
}

async function requestFigmaWithTimeout(url, token) {
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    timeoutController.abort();
  }, FIGMA_API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "X-Figma-Token": token },
      signal: timeoutController.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function parseErrorDetails(rawText) {
  try {
    const parsed = JSON.parse(String(rawText || ""));
    if (!parsed || typeof parsed !== "object") return "";
    const err = String(parsed.err || parsed.error || "").trim();
    const message = String(parsed.message || "").trim();
    if (err && message) return `${err}: ${message}`;
    return err || message;
  } catch {
    return "";
  }
}

export async function handleFigmaPingRoute(c, deps) {
  const { failJson, readJsonBody } = deps;
  const body = await readJsonBody(c);

  const figmaUrl = String(body.figmaUrl || "").trim();
  const figmaToken = String(body.figmaToken || "").trim();

  if (!figmaUrl || !figmaToken) {
    return failJson(c, 400, {
      code: "ping.missing_params",
      userMessage: "Both figmaUrl and figmaToken are required.",
      recoverable: true,
    });
  }

  const parsedUrl = parseFigmaUrl(figmaUrl);
  if (!parsedUrl.ok) {
    return failJson(c, 400, {
      code: "ping.invalid_url",
      userMessage: "Invalid Figma URL.",
      recoverable: true,
    });
  }
  if (!parsedUrl.hostValid) {
    return failJson(c, 400, {
      code: "ping.invalid_host",
      userMessage: "URL host must be figma.com.",
      recoverable: true,
    });
  }

  const fileKey = parsedUrl.fileKey;
  if (!fileKey) {
    return failJson(c, 400, {
      code: "ping.invalid_url",
      userMessage: "Could not extract a file key from the provided Figma URL.",
      recoverable: true,
    });
  }

  const resolvedToken = resolveTokenValue(figmaToken);
  if (!resolvedToken) {
    return c.json(
      {
        ok: false,
        code: "ping.env_var_not_set",
        message: "The environment variable referenced by the token is not set on the server.",
        fileKey,
      },
      200,
    );
  }

  let figmaResponse;
  try {
    figmaResponse = await requestFigmaWithTimeout(
      `https://api.figma.com/v1/files/${fileKey}?depth=1`,
      resolvedToken,
    );
  } catch (err) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return c.json(
      {
        ok: false,
        code: isTimeout ? "ping.timeout" : "ping.network_error",
        message: isTimeout
          ? "Figma API did not respond within the timeout. Check your network."
          : "Could not reach the Figma API. Check your network connection.",
        },
      200,
    );
  }

  if (!figmaResponse.ok) {
    const status = figmaResponse.status;
    if (status === 403) {
      return c.json(
        { ok: false, code: "figma.403", message: "The token does not have permission to read this file.", fileKey },
        200,
      );
    }
    if (status === 404) {
      return c.json(
        { ok: false, code: "figma.404", message: "File not found. Verify the URL is correct.", fileKey },
        200,
      );
    }
    return c.json(
      { ok: false, code: `figma.${status}`, message: `Figma returned HTTP ${status}.`, fileKey },
      200,
    );
  }

  let json;
  try {
    json = await figmaResponse.json();
  } catch {
    return c.json(
      { ok: false, code: "ping.parse_error", message: "Figma responded but the body could not be parsed." },
      200,
    );
  }

  let variablesResponse;
  try {
    variablesResponse = await requestFigmaWithTimeout(
      `https://api.figma.com/v1/files/${fileKey}/variables/local`,
      resolvedToken,
    );
  } catch (err) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return c.json(
      {
        ok: false,
        code: isTimeout ? "ping.variables_timeout" : "ping.variables_network_error",
        message: isTimeout
          ? "Token can read the file, but variables check timed out. Try again."
          : "Token can read the file, but variables check failed due to a network error.",
        fileKey,
      },
      200,
    );
  }

  if (!variablesResponse.ok) {
    const rawError = await variablesResponse.text();
    const details = parseErrorDetails(rawError);
    const detailsLower = details.toLowerCase();
    if (variablesResponse.status === 403 && detailsLower.includes("file_variables:read")) {
      return c.json(
        {
          ok: true,
          code: "figma.variables_scope_missing",
          message:
            "Token can read the file but cannot read variables via REST. MCP Management will be used for variables sync.",
          fileName: String(json.name || fileKey),
          fileKey,
        },
        200,
      );
    }
    return c.json(
      {
        ok: false,
        code: `figma.variables.${variablesResponse.status}`,
        message:
          `Token can read the file, but variables endpoint returned HTTP ${variablesResponse.status}.` +
          (details ? ` ${details}` : ""),
        fileKey,
      },
      200,
    );
  }

  return c.json({ ok: true, fileName: String(json.name || fileKey), fileKey }, 200);
}

export function registerFigmaPingRoute(app, deps) {
  app.post("/api/figma-ping", (c) => handleFigmaPingRoute(c, deps));
}
