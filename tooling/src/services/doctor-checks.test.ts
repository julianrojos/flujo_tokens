import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { resolveDoctorContext } from './doctor-checks.js';

describe('doctor-checks', () => {
  it('resolveDoctorContext uses proof-dir override and no render payload field', () => {
    const parsed = {
      'docs-root': './tmp/design-systems/sys-01/docs/components',
      'spec-root': './tmp/design-systems/sys-01/docs/_spec/components',
      registry: './tmp/docs/_generated/token-registry.json',
      'component-registry': './tmp/apps/ds-dashboard/server/db/ds-dashboard.db',
      'proof-dir': './tmp/docs/_generated/visual-proofs',
      'component-name': 'Button',
      'skip-validate': 'true',
    };

    const systemCtx = {
      id: 'sys-01',
      paths: {
        docs: '/fallback/docs',
        specs: '/fallback/specs',
        tokenRegistry: '/fallback/token-registry.json',
        databaseUrl: '/fallback/ds-dashboard.db',
        generated: '/fallback/generated',
      },
    };

    const result = resolveDoctorContext(parsed, systemCtx, '/repo');

    assert.equal(result.docsRoot, path.resolve('./tmp/design-systems/sys-01/docs/components'));
    assert.equal(result.specRoot, path.resolve('./tmp/design-systems/sys-01/docs/_spec/components'));
    assert.equal(result.visualProofDir, path.resolve('./tmp/docs/_generated/visual-proofs'));
    assert.equal(result.skipValidate, true);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'renderPayloadDir'), false);
  });

  it('resolveDoctorContext falls back to generated/visual-proofs when proof-dir is missing', () => {
    const parsed = {};
    const systemCtx = {
      id: 'sys-01',
      paths: {
        docs: '/system/design-systems/sys-01/docs/components',
        specs: '/system/design-systems/sys-01/docs/_spec/components',
        tokenRegistry: '/system/docs/_generated/token-registry.json',
        databaseUrl: '/system/apps/ds-dashboard/server/db/ds-dashboard.db',
        generated: '/system/docs/_generated',
      },
    };

    const result = resolveDoctorContext(parsed, systemCtx, '/repo');
    assert.equal(result.visualProofDir, path.resolve('/system/docs/_generated/visual-proofs'));
  });
});
