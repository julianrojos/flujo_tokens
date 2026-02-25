import { fetchFigmaFile, fetchFigmaNodes } from "./figma-api.mjs";
import { extractSingleNodeCandidate } from "./figma-component-discovery.mjs";
import { buildFigmaComponentMap } from "./figma-component-map.mjs";

export function configureFigmaContext({
  descriptor,
  figmaToken,
  fetchFigmaFileFn = fetchFigmaFile,
  fetchFigmaNodesFn = fetchFigmaNodes,
  extractSingleNodeCandidateFn = extractSingleNodeCandidate,
  buildFigmaComponentMapFn = buildFigmaComponentMap,
}) {
  let filePayload = null;

  const ensureFilePayload = async () => {
    if (filePayload) return filePayload;
    filePayload = await fetchFigmaFileFn({
      fileKey: descriptor.fileKey,
      token: figmaToken,
    });
    return filePayload;
  };

  const resolveContext = async () => {
    let componentMap = null;
    let singleNodeCandidate = null;

    if (descriptor.nodeIdFromUrl) {
      try {
        const nodePayload = await fetchFigmaNodesFn({
          fileKey: descriptor.fileKey,
          nodeIds: [descriptor.nodeIdFromUrl],
          token: figmaToken,
          depth: 1,
        });
        singleNodeCandidate = extractSingleNodeCandidateFn(nodePayload, descriptor.nodeIdFromUrl);
      } catch {
        singleNodeCandidate = {
          node_id: descriptor.nodeIdFromUrl,
          name: descriptor.nodeIdFromUrl,
          kind: "unknown",
          page_name: null,
        };
      }
    } else {
      filePayload = await ensureFilePayload();
      componentMap = buildFigmaComponentMapFn({
        filePayload,
        fileDescriptor: descriptor,
        includeInstances: true,
      });
    }

    return {
      componentMap,
      singleNodeCandidate,
    };
  };

  /**
   * filePayload is internally cached after ensureFilePayload is called
   * to avoid duplicate network requests for the same Figma file.
   */
  return { 
    ensureFilePayload, 
    resolveContext,
    getFilePayload: () => filePayload 
  };
}
