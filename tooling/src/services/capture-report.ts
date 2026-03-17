/**
 * Capture Report
 *
 * Creates capture report from pipeline execution results.
 */

import * as path from 'node:path';

import type { CaptureTarget } from './capture-target-builder.js';
import type { SourceCandidate } from './capture-target-builder.js';
import type { SpecExhibits } from './capture-target-builder.js';

/**
 * Mapped capture target for report.
 */
export interface MappedCaptureTarget {
  slug: string;
  node_id: string;
  kind: string;
  page_name: string | null;
  markdown_path: string;
  spec_path: string;
  spec_exists: boolean;
  figma_url: string;
  spec_exhibits: {
    specs_node_id: string | null;
    anatomy: { nodeId: string | null; imageUrl: string | null } | null;
    properties: { nodeId: string | null; imageUrl: string | null } | null;
    layout: { nodeId: string | null; imageUrl: string | null } | null;
  } | null;
}

/**
 * Capture report structure.
 */
export interface CaptureReport {
  ok: boolean;
  dryRun: boolean;
  source: {
    figma_url: string;
    file_key: string;
    node_id_from_url: string | null;
  };
  requested: Record<string, unknown>;
  tokens_bootstrap: unknown;
  tokens_compile: unknown;
  total_candidates: number;
  targets_total: number;
  targets: MappedCaptureTarget[];
  captured: unknown[];
  failed: unknown[];
  skipped: unknown[];
  indices_refreshed: boolean;
}

/**
 * Map capture target to report format.
 */
export function mapCaptureTargetForReport(
  target: CaptureTarget,
  repoRoot: string,
): MappedCaptureTarget {
  return {
    slug: String(target.slug),
    node_id: String(target.nodeId),
    kind: String(target.kind),
    page_name: target.pageName ? String(target.pageName) : null,
    markdown_path: path.relative(repoRoot, String(target.markdownPath)),
    spec_path: path.relative(repoRoot, String(target.specPath)),
    spec_exists: Boolean(target.specExists),
    figma_url: target.nodeUrl ? String(target.nodeUrl) : '',
    spec_exhibits: target.specExhibits
      ? {
          specs_node_id: target.specExhibits.specsNodeId,
          anatomy: target.specExhibits.anatomy,
          properties: target.specExhibits.properties,
          layout: target.specExhibits.layout,
        }
      : null,
  };
}

/**
 * Create capture report from pipeline execution.
 */
export function createCaptureReport(params: {
  dryRun: boolean;
  descriptor: {
    sourceUrl: string;
    fileKey: string;
    nodeIdFromUrl?: string;
  };
  requested: Record<string, unknown>;
  tokenBootstrap: unknown;
  tokenCompile: unknown;
  sourceCandidates: SourceCandidate[];
  targets: CaptureTarget[];
  skipped: unknown[];
  repoRoot: string;
}): CaptureReport {
  const {
    dryRun,
    descriptor,
    requested,
    tokenBootstrap,
    tokenCompile,
    sourceCandidates,
    targets,
    skipped,
    repoRoot,
  } = params;

  return {
    ok: true,
    dryRun,
    source: {
      figma_url: descriptor.sourceUrl,
      file_key: descriptor.fileKey,
      node_id_from_url: descriptor.nodeIdFromUrl || null,
    },
    requested,
    tokens_bootstrap: tokenBootstrap,
    tokens_compile: tokenCompile,
    total_candidates: sourceCandidates.length,
    targets_total: targets.length,
    targets: targets.map((target) => mapCaptureTargetForReport(target, repoRoot)),
    captured: [],
    failed: [],
    skipped,
    indices_refreshed: false,
  };
}
