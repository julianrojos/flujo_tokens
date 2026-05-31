import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSlugLookupFromRegistry,
  resolveInferredSlug,
} from './capture-targets.js';

describe('capture-targets', () => {
  it('resolves slugs from registry, falling back to candidate name', () => {
    const slugByNodeFromRegistry = buildSlugLookupFromRegistry([
      {
        slug: 'alert',
        figma: {
          component_set_node_id: '10:20',
        },
      },
    ]);

    assert.equal(
      resolveInferredSlug({
        slugByNodeFromRegistry,
        nodeId: '10:20',
        candidateName: 'Alert Card',
      }),
      'alert',
    );

    assert.equal(
      resolveInferredSlug({
        slugByNodeFromRegistry,
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
        nodeId: '10:20',
        candidateName: 'Primary Button',
      }),
      'button',
    );
  });

  it('keeps an explicit slug override ahead of inferred values', () => {
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
        applySlugOverride: true,
        componentSlugOverride: 'manual-alert',
        slugByNodeFromRegistry,
        nodeId: '10:20',
        candidateName: 'Alert Card',
      }),
      'manual-alert',
    );
  });

  it('falls back to a stable node-id based slug when the name is not sluggable', () => {
    assert.equal(
      resolveInferredSlug({
        nodeId: '123:456',
        candidateName: '!!!',
      }),
      'component_123_456',
    );
  });
});
