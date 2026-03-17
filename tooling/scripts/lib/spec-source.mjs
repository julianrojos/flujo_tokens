import { normalizeNodeId } from "./node-id.mjs";
import { assertFigmaSourceProvided } from "./spec-run-guards.mjs";

export function parseFigmaUrl(figmaUrl) {
  if (!figmaUrl) return { fileKey: "", nodeId: "" };
  let url;
  try {
    url = new URL(figmaUrl);
  } catch {
    return { fileKey: "", nodeId: "" };
  }

  const pathnameParts = url.pathname.split("/").filter(Boolean);
  const keyRootIndex = pathnameParts.findIndex(
    (part) => part === "design" || part === "file",
  );
  const fileKey =
    keyRootIndex >= 0 && pathnameParts[keyRootIndex + 1]
      ? pathnameParts[keyRootIndex + 1]
      : "";

  const nodeParamKeys = ["node-id", "node_id", "nodeId"];
  let rawNodeId = "";
  for (const key of nodeParamKeys) {
    const value = url.searchParams.get(key);
    if (value) {
      rawNodeId = value;
      break;
    }
  }

  if (!rawNodeId) {
    const hashRaw = String(url.hash || "").replace(/^#/, "");
    if (hashRaw) {
      const hashParams = new URLSearchParams(hashRaw.replace(/^[/?]+/, ""));
      for (const key of nodeParamKeys) {
        const value = hashParams.get(key);
        if (value) {
          rawNodeId = value;
          break;
        }
      }

      if (!rawNodeId) {
        const match = hashRaw.match(/(?:^|[?&])node-?id=([^&]+)/i);
        if (match && match[1]) {
          rawNodeId = decodeURIComponent(match[1]);
        }
      }
    }
  }

  const nodeId = normalizeNodeId(rawNodeId);
  return { fileKey, nodeId };
}

export function resolveFigmaSource({ figmaUrl, explicitNodeId, rawComponentName }) {
  assertFigmaSourceProvided({ figmaUrl, nodeId: explicitNodeId, rawComponentName });
  
  const parsedUrl = parseFigmaUrl(figmaUrl);
  const fileKeyFromUrl = parsedUrl.fileKey;
  const nodeId = explicitNodeId || parsedUrl.nodeId;
  
  // Re-verify after parse in case URL didn't contain an ID and no explicit ID was provided
  assertFigmaSourceProvided({ figmaUrl, nodeId, rawComponentName });

  return {
    fileKeyFromUrl,
    nodeId
  };
}
