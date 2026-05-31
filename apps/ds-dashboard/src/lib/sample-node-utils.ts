import type { SampleNodeRef } from "@/types/consumers";

export function dedupeSampleNodes(
  sampleNodes: ReadonlyArray<SampleNodeRef>,
  limit?: number,
): SampleNodeRef[] {
  const byNodeId = new Map<string, SampleNodeRef>();

  for (const sampleNode of sampleNodes) {
    const nodeId = String(sampleNode.nodeId || "").trim();
    if (!nodeId || byNodeId.has(nodeId)) continue;
    byNodeId.set(nodeId, {
      nodeId,
      pageName: String(sampleNode.pageName || "").trim(),
    });
  }

  const deduped = Array.from(byNodeId.values());
  return typeof limit === "number" ? deduped.slice(0, limit) : deduped;
}
