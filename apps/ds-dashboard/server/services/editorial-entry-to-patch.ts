import type { EditorialEntry } from '../db/component-repository.js';
import { EDITORIAL_PATCH_SCHEMA_VERSION, type EditorialPatch } from './ai-editorial-patch-schema.js';

/**
 * Convert an EditorialEntry (DB shape) into an EditorialPatch (AI patch shape).
 * Returns null when entry is null/undefined.
 */
export function entryToEditorialPatch(entry: EditorialEntry | null | undefined): EditorialPatch | null {
  if (!entry) return null;

  const patch: EditorialPatch = {
    schemaVersion: EDITORIAL_PATCH_SCHEMA_VERSION,
  };

  const summary = entry.summary as Record<string, unknown> | undefined;
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    patch.summary = {
      purpose: typeof summary.purpose === 'string' ? summary.purpose : undefined,
      when_to_use: typeof summary.when_to_use === 'string' ? summary.when_to_use : undefined,
      when_not_to_use: typeof summary.when_not_to_use === 'string' ? summary.when_not_to_use : undefined,
    };
  }

  const cg = entry.contentGuidelines as Record<string, unknown> | undefined;
  if (cg && typeof cg === 'object' && !Array.isArray(cg) && Array.isArray(cg.rules)) {
    patch.content_guidelines = {
      rules: cg.rules.filter((x): x is string => typeof x === 'string'),
    };
  }

  const acc = entry.accessibility as Record<string, unknown> | undefined;
  if (acc && typeof acc === 'object' && !Array.isArray(acc)) {
    const labelingRules = acc.labeling && typeof acc.labeling === 'object'
      ? (acc.labeling as Record<string, unknown>).rules
      : undefined;
    patch.accessibility = {
      role: typeof acc.role === 'string' ? acc.role : undefined,
      labeling: Array.isArray(labelingRules)
        ? { rules: labelingRules.filter((x): x is string => typeof x === 'string') }
        : undefined,
      notes: Array.isArray(acc.notes) ? acc.notes.filter((x): x is string => typeof x === 'string') : undefined,
    };
  }

  if (Array.isArray(entry.relatedComponents)) {
    patch.related_components = entry.relatedComponents.filter((x): x is string => typeof x === 'string');
  }

  if (Array.isArray(entry.qa)) {
    patch.qa = entry.qa.filter((x): x is string => typeof x === 'string');
  }

  return patch;
}
