import { stripDiacritics } from '../../../../tooling/src/utils/strip-diacritics.js';

export type FigmaDiffBucket =
  | 'new_in_figma'
  | 'updated_in_figma'
  | 'unchanged'
  | 'missing_in_figma';

export interface FigmaNodeSnapshot {
  nodeId: string;
  name: string;
  type: string;
  slug?: string;
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

function normalizeSlug(value: string): string {
  return (
    stripDiacritics(String(value || '').trim())
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

function isKnownDbNodeId(db: DbComponentRef): boolean {
  return normalizeNodeId(db.nodeId).length > 0;
}

function normalizeContentFingerprint(value: string): string {
  const parts = String(value || '').trim().split('||');
  if (parts.length < 4) {
    return String(value || '').trim();
  }
  const [name, type, pageName, variantCount, ...rest] = parts;
  return [
    name.trim(),
    type.trim().toLowerCase(),
    pageName.trim(),
    variantCount.trim(),
    ...rest.map((part) => part.trim()),
  ].join('||');
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
  const dbBySlug = new Map<string, DbComponentRef>();
  for (const dbComponent of dbComponents) {
    const nodeId = normalizeNodeId(dbComponent.nodeId);
    if (nodeId && !dbByNodeId.has(nodeId)) {
      dbByNodeId.set(nodeId, dbComponent);
    }
    const slug = normalizeSlug(dbComponent.slug);
    if (slug && !dbBySlug.has(slug)) {
      dbBySlug.set(slug, dbComponent);
    }
  }

  const seenDbIds = new Set<number>();
  const newInFigma: FigmaNodeSnapshot[] = [];
  const updatedInFigma: Array<{ figma: FigmaNodeSnapshot; db: DbComponentRef }> = [];
  const unchanged: Array<{ figma: FigmaNodeSnapshot; db: DbComponentRef }> = [];

  for (const figmaSnapshot of figmaSnapshots) {
    const nodeId = normalizeNodeId(figmaSnapshot.nodeId);
    if (!nodeId) continue;

    const slug = normalizeSlug(figmaSnapshot.slug || figmaSnapshot.name);
    const dbComponent = dbByNodeId.get(nodeId) ?? (slug ? dbBySlug.get(slug) : undefined);
    if (!dbComponent) {
      newInFigma.push(figmaSnapshot);
      continue;
    }

    seenDbIds.add(dbComponent.id);
    if (
      !String(dbComponent.contentFingerprint || '').trim()
    ) {
      unchanged.push({ figma: figmaSnapshot, db: dbComponent });
      continue;
    }
    if (
      normalizeContentFingerprint(dbComponent.contentFingerprint) !==
      normalizeContentFingerprint(figmaSnapshot.contentFingerprint)
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
    return !seenDbIds.has(dbComponent.id);
  });

  return {
    new_in_figma: newInFigma,
    updated_in_figma: updatedInFigma,
    unchanged,
    missing_in_figma: missingInFigma,
  };
}
