/**
 * Capture Visual Proof Figma
 *
 * Functions for reading and transforming Figma data.
 * These are pure functions — no HTTP requests, only process data from disk or already-fetched responses.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { VariantNode } from '../types/capture-visual-proof.js';

/**
 * Parse Figma file key from URL.
 */
export function parseFigmaFileKeyFromUrl(figmaUrl: string): string {
  const raw = String(figmaUrl || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const markerIndex = parts.findIndex(
      (part) =>
        part.toLowerCase() === 'design' || part.toLowerCase() === 'file',
    );
    if (markerIndex === -1) return '';
    return String(parts[markerIndex + 1] || '').trim();
  } catch {
    return '';
  }
}

/**
 * Load Figma config from spec file.
 */
export function loadSpecFigma(
  specPath: string,
  parseYamlDocumentFn: (content: string, label: string) => Record<string, unknown>,
): Record<string, unknown> {
  if (!fs.existsSync(specPath)) return {};
  const spec = parseYamlDocumentFn(
    fs.readFileSync(specPath, 'utf8'),
    `spec YAML (${path.basename(specPath)})`,
  );
  const figma = (spec as Record<string, unknown>).figma;
  return figma && typeof figma === 'object' && !Array.isArray(figma)
    ? (figma as Record<string, unknown>)
    : {};
}

/**
 * Resolve Figma file key from URL or spec.
 */
export function resolveFigmaFileKey({
  figmaUrl,
  specFigma,
}: {
  figmaUrl: string;
  specFigma: Record<string, unknown>;
}): string {
  const fromUrl = parseFigmaFileKeyFromUrl(figmaUrl);
  if (fromUrl) return fromUrl;
  const fromSpec = String(specFigma?.file || '').trim();
  if (fromSpec && fromSpec.toUpperCase() !== 'TBD') return fromSpec;
  return '';
}

/**
 * Extract variant nodes from Figma node payload.
 */
export function extractVariantNodes(
  nodePayload: Record<string, unknown> | null,
  rootNodeId: string,
  normalizeNodeIdFn: (nodeId: string) => string,
  isValidNodeIdFn: (nodeId: string) => boolean,
): VariantNode[] {
  const nodes =
    nodePayload && typeof nodePayload === 'object'
      ? (nodePayload.nodes as Record<string, unknown> | undefined)
      : null;
  const root =
    nodes && nodes[rootNodeId] && (nodes[rootNodeId] as Record<string, unknown>).document
      ? ((nodes[rootNodeId] as Record<string, unknown>).document as Record<string, unknown>)
      : null;
  if (!root || typeof root !== 'object') return [];

  const rootType = String(root.type || '').toUpperCase();
  const variants: VariantNode[] = [];

  if (rootType === 'COMPONENT_SET' && Array.isArray(root.children)) {
    for (const child of root.children) {
      if (!child || typeof child !== 'object') continue;
      if (String(child.type || '').toUpperCase() !== 'COMPONENT') continue;
      const childId = normalizeNodeIdFn(String(child.id || '').trim());
      if (!childId || !isValidNodeIdFn(childId)) continue;
      variants.push({
        nodeId: childId,
        name: String(child.name || childId).trim() || childId,
      });
    }
  } else if (rootType === 'COMPONENT') {
    const rootId =
      normalizeNodeIdFn(String(root.id || rootNodeId).trim()) || rootNodeId;
    if (rootId && isValidNodeIdFn(rootId)) {
      variants.push({
        nodeId: rootId,
        name: String(root.name || rootId).trim() || rootId,
      });
    }
  }

  return variants.sort((a, b) =>
    `${a.name}|${a.nodeId}`.localeCompare(`${b.name}|${b.nodeId}`, 'en', {
      sensitivity: 'base',
    }),
  );
}

/**
 * Extract first JSON object from text (handles fenced code blocks).
 */
export function extractFirstJsonObject(rawText: string): Record<string, unknown> | null {
  const text = String(rawText || '').trim();
  if (!text) return null;

  const tryParse = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct && typeof direct === 'object') return direct;

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    const parsed = tryParse(fencedMatch[1].trim());
    if (parsed && typeof parsed === 'object') return parsed;
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        const parsed = tryParse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
        start = -1;
      }
    }
  }

  return null;
}
