/**
 * Capture Report
 *
 * Creates and formats capture reports for batch operations.
 */

import * as path from 'node:path';

import type { ParsedFigmaUrl } from '../utils/figma-url-parser.js';
import type { CaptureTarget } from './capture-target-builder.js';
import type { TokenBootstrapResult, TokenCompileResult } from './capture-token-orchestrator.js';

/**
 * Spec exhibit data for report.
 */
export interface SpecExhibitData {
  specs_node_id: string | null;
  anatomy: unknown | null;
  properties: unknown | null;
  layout: unknown | null;
}

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
  spec_exhibits: SpecExhibitData | null;
}

/**
 * Skipped component entry.
 */
export interface SkippedComponent {
  slug?: string;
  node_id: string;
  name: string;
  reason: string;
  markdown_path?: string;
  error?: string;
}

/**
 * Source candidate for capture.
 */
export interface SourceCandidate {
  node_id: string;
  name: string;
  kind?: string;
  [key: string]: unknown;
}

/**
 * Create capture report parameters.
 */
export interface CreateCaptureReportParams {
  dryRun: boolean;
  descriptor: ParsedFigmaUrl;
  requested: Record<string, unknown>;
  tokenBootstrap: TokenBootstrapResult;
  tokenCompile: TokenCompileResult;
  sourceCandidates: SourceCandidate[];
  targets: CaptureTarget[];
  skipped: SkippedComponent[];
  repoRoot: string;
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
  tokens_bootstrap: TokenBootstrapResult;
  tokens_compile: TokenCompileResult;
  total_candidates: number;
  targets_total: number;
  targets: MappedCaptureTarget[];
  captured: unknown[];
  failed: unknown[];
  skipped: SkippedComponent[];
  indices_refreshed: boolean;
}

/**
 * Map capture target to report format.
 *
 * @param target - Capture target.
 * @param repoRoot - Repository root.
 * @returns Mapped target for report.
 */
export function mapCaptureTargetForReport(
  target: CaptureTarget,
  repoRoot: string,
): MappedCaptureTarget {
  return {
    slug: target.slug,
    node_id: target.nodeId,
    kind: target.kind,
    page_name: target.pageName,
    markdown_path: path.relative(repoRoot, target.markdownPath),
    spec_path: path.relative(repoRoot, target.specPath),
    spec_exists: target.specExists,
    figma_url: target.nodeUrl,
    spec_exhibits: target.specExhibits
      ? {
          specs_node_id: target.specExhibits.specsNodeId ?? null,
          anatomy: target.specExhibits.anatomy ?? null,
          properties: target.specExhibits.properties ?? null,
          layout: target.specExhibits.layout ?? null,
        }
      : null,
  };
}

/**
 * Create capture report from batch operation results.
 *
 * @param params - Report creation parameters.
 * @returns Capture report.
 */
export function createCaptureReport(params: CreateCaptureReportParams): CaptureReport {
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
      figma_url: descriptor.figmaUrl,
      file_key: descriptor.fileKey,
      node_id_from_url: descriptor.nodeIdFromUrl ?? null,
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
