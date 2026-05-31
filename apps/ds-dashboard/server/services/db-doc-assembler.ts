/**
 * DB Doc Assembler
 *
 * S-02: Builds ComponentDocOutput from DB sources (component_docs, component_editorial,
 * component_figma_variants) so that markdown can always be generated — even when no AI
 * pipeline has ever run.
 */

import type {
  ComponentDocOutput,
  ComponentDocVariant,
} from '../services/ai-component-doc-schema.js';
import type { EditorialPatch } from '../services/ai-editorial-patch-schema.js';
import type { ComponentRepository } from '../db/component-repository.js';
import type { EditorialEntry } from '../db/component-repository.js';
import { entryToEditorialPatch } from './editorial-entry-to-patch.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildDocOutputFromDb(
  componentId: number,
  repo: ComponentRepository,
  preloadedFigmaDescriptions?: Awaited<
    ReturnType<ComponentRepository['getFigmaDescriptions']>
  > | null,
): Promise<{
  output: ComponentDocOutput;
  editorialPatch: EditorialPatch | null;
  warnings: string[];
}> {
  const warnings: string[] = [];

  // 1. Basic info
  const basicInfo = await repo.getComponentBasicInfo(componentId);
  const name = basicInfo?.name ?? 'Unknown';
  const title = basicInfo?.displayName ?? name;
  // Use the captured Figma component set node ID when available.
  // If absent, keep an empty value instead of leaking an internal DB numeric ID.
  const figmaNodeId = basicInfo?.figmaComponentSetNodeId ?? '';

  // 2. AI doc record (if any)
  const docRecord = await repo.getComponentDoc(componentId);
  let aiOutput: ComponentDocOutput | null = null;
  if (docRecord) {
    try {
      aiOutput = JSON.parse(docRecord.outputJson) as ComponentDocOutput;
    } catch {
      warnings.push('AI doc JSON is malformed — falling back to DB-only assembly');
    }
  }

  // 3. Editorial data (live, from component_editorial table)
  const editorialEntry = await repo.getEditorial(componentId);

  // 4. Figma descriptions (reuse preloaded if provided to avoid duplicate DB read)
  const figmaRaw = preloadedFigmaDescriptions !== undefined
    ? preloadedFigmaDescriptions
    : await repo.getFigmaDescriptions(componentId);

  // 5. Resolve summary
  const summary = resolveSummary(editorialEntry, aiOutput);

  // 6. Build variants
  const variants = buildVariantsFromDb(figmaRaw, aiOutput);

  // 7. Assemble output
  const output: ComponentDocOutput = {
    schemaVersion: aiOutput?.schemaVersion ?? 2,
    componentId: figmaNodeId,
    title,
    summary,
    variants,
    accessibilityNotes: aiOutput?.accessibilityNotes ?? [],
    markdown: '',  // renderer fills this
    states: aiOutput?.states ?? [],
    accessibilityFacts: aiOutput?.accessibilityFacts ?? [],
    metadata: aiOutput?.metadata,
  };

  // 8. Build editorial patch
  const editorialPatch = entryToEditorialPatch(editorialEntry);

  return { output, editorialPatch, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers (pure functions)
// ---------------------------------------------------------------------------

function resolveSummary(
  editorial: EditorialEntry | null,
  aiOutput: ComponentDocOutput | null,
): string {
  const editorialPurpose = typeof editorial?.summary === 'object' && editorial.summary !== null
    ? (editorial.summary as Record<string, unknown>).purpose as string | undefined
    : undefined;
  return editorialPurpose?.trim()
    || aiOutput?.summary?.trim()
    || 'No summary available yet.';
}

function parseCanonicalKey(key: string): Record<string, string> {
  if (!key) return {};
  return Object.fromEntries(
    key.split('|').map((pair) => {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) return [pair, ''];
      return [pair.slice(0, eqIdx), pair.slice(eqIdx + 1)];
    }),
  );
}

function buildVariantsFromDb(
  figmaRaw: ReturnType<ComponentRepository['getFigmaDescriptions']>,
  aiOutput: ComponentDocOutput | null,
): ComponentDocVariant[] {
  const figmaVariants = figmaRaw?.variants ?? [];
  if (figmaVariants.length > 0) {
    return figmaVariants.map((v, index) => ({
      id: v.nodeId || v.canonicalKey || `variant-${index}`,
      name: v.canonicalKey || v.nodeId,
      description: v.description ?? '',
      properties: parseCanonicalKey(v.canonicalKey ?? ''),
    }));
  }
  return aiOutput?.variants ?? [];
}
