import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSlugLookupFromRegistry,
  buildSlugLookupFromSpecContents,
  resolveInferredSlug,
} from './capture-targets.js';

describe('capture-targets', () => {
  it('resolves slugs from specs before falling back to the candidate name', () => {
    const slugByNodeFromSpecs = buildSlugLookupFromSpecContents([
      {
        slug: 'alert',
        content: [
          'name: alert',
          'component_set_node_id: 10:20',
          '',
        ].join('\n'),
      },
    ]);

    assert.equal(
      resolveInferredSlug({
        slugByNodeFromSpecs,
        nodeId: '10:20',
        candidateName: 'Alert Card',
      }),
      'alert',
    );

    assert.equal(
      resolveInferredSlug({
        slugByNodeFromSpecs,
        nodeId: '99:88',
        candidateName: 'Alert Card',
      }),
      'alert_card',
    );
  });

  it('prefers persisted registry slugs over inferred names when available', () => {
    const slugByNodeFromRegistry = buildSlugLookupFromRegistry([
      {
        slug: 'button',
        figma: {
          component_set_node_id: '10:20',
        },
      },
    ]);

    assert.equal(
      resolveInferredSlug({
        slugByNodeFromRegistry,
        slugByNodeFromSpecs: new Map(),
        nodeId: '10:20',
        candidateName: 'Primary Button',
      }),
      'button',
    );
  });

  it('keeps an explicit slug override ahead of inferred values', () => {
    const slugByNodeFromSpecs = buildSlugLookupFromSpecContents([
      {
        slug: 'button',
        content: [
          'name: button',
          'component_set_node_id: 10:20',
          '',
        ].join('\n'),
      },
    ]);

    assert.equal(
      resolveInferredSlug({
        applySlugOverride: true,
        componentSlugOverride: 'manual-alert',
        slugByNodeFromSpecs,
        nodeId: '10:20',
        candidateName: 'Alert Card',
      }),
      'manual-alert',
    );
  });
});
