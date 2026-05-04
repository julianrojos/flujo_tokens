export type FigmaDiffBucket =
  | 'new_in_figma'
  | 'updated_in_figma'
  | 'unchanged'
  | 'missing_in_figma';

export interface FigmaNodeSnapshot {
  nodeId: string;
  name: string;
  type: string;
  pageName?: string;
  variantCount?: number;
  contentFingerprint: string;
}

export interface DbComponentRef {
  id: number;
  nodeId: string;
  slug: string;
  name: string;
  status: string;
  contentFingerprint: string | null;
}

export interface FigmaDiffResult {
  new_in_figma: FigmaNodeSnapshot[];
  updated_in_figma: Array<{ figma: FigmaNodeSnapshot; db: DbComponentRef }>;
  unchanged: Array<{ figma: FigmaNodeSnapshot; db: DbComponentRef }>;
  missing_in_figma: DbComponentRef[];
}

function normalizeNodeId(value: string): string {
  return String(value || '').trim();
}

function isKnownDbNodeId(db: DbComponentRef): boolean {
  return normalizeNodeId(db.nodeId).length > 0;
}

export function computeContentFingerprint(snapshot: {
  name: string;
  type: string;
  pageName?: string;
  variantCount?: number;
}): string {
  return [
    String(snapshot.name || '').trim(),
    String(snapshot.type || '').trim(),
    String(snapshot.pageName || '').trim(),
    String(snapshot.variantCount ?? 0),
  ].join('||');
}

export function diffFigmaVsDb(
  figmaSnapshots: readonly FigmaNodeSnapshot[],
  dbComponents: readonly DbComponentRef[],
): FigmaDiffResult {
  const dbByNodeId = new Map<string, DbComponentRef>();
  for (const dbComponent of dbComponents) {
    const nodeId = normalizeNodeId(dbComponent.nodeId);
    if (!nodeId || dbByNodeId.has(nodeId)) continue;
    dbByNodeId.set(nodeId, dbComponent);
  }

  const seenDbNodeIds = new Set<string>();
  const newInFigma: FigmaNodeSnapshot[] = [];
  const updatedInFigma: Array<{ figma: FigmaNodeSnapshot; db: DbComponentRef }> = [];
  const unchanged: Array<{ figma: FigmaNodeSnapshot; db: DbComponentRef }> = [];

  for (const figmaSnapshot of figmaSnapshots) {
    const nodeId = normalizeNodeId(figmaSnapshot.nodeId);
    if (!nodeId) continue;

    const dbComponent = dbByNodeId.get(nodeId);
    if (!dbComponent) {
      newInFigma.push(figmaSnapshot);
      continue;
    }

    seenDbNodeIds.add(nodeId);
    if (
      !dbComponent.contentFingerprint ||
      dbComponent.contentFingerprint !== figmaSnapshot.contentFingerprint
    ) {
      updatedInFigma.push({ figma: figmaSnapshot, db: dbComponent });
      continue;
    }

    unchanged.push({ figma: figmaSnapshot, db: dbComponent });
  }

  const missingInFigma = dbComponents.filter((dbComponent) => {
    if (!isKnownDbNodeId(dbComponent)) {
      return false;
    }
    return !seenDbNodeIds.has(normalizeNodeId(dbComponent.nodeId));
  });

  return {
    new_in_figma: newInFigma,
    updated_in_figma: updatedInFigma,
    unchanged,
    missing_in_figma: missingInFigma,
  };
}
