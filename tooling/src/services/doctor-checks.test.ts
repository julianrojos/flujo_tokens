import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';

import { resolveDoctorContext } from './doctor-checks.js';

describe('doctor-checks', () => {
  it('resolveDoctorContext uses proof-dir override and no render payload field', () => {
    const parsed = {
      'docs-root': './tmp/docs/components',
      'spec-root': './tmp/docs/_spec/components',
      registry: './tmp/docs/_generated/token-registry.json',
      'component-registry': './tmp/docs/_generated/component-registry.json',
      'proof-dir': './tmp/docs/_generated/visual-proofs',
      'component-name': 'Button',
      'skip-validate': 'true',
    };

    const systemCtx = {
      paths: {
        docs: '/fallback/docs',
        specs: '/fallback/specs',
        tokenRegistry: '/fallback/token-registry.json',
        registry: '/fallback/component-registry.json',
        generated: '/fallback/generated',
      },
    };

    const result = resolveDoctorContext(parsed, systemCtx, '/repo');

    assert.equal(result.docsRoot, path.resolve('./tmp/docs/components'));
    assert.equal(result.specRoot, path.resolve('./tmp/docs/_spec/components'));
    assert.equal(result.visualProofDir, path.resolve('./tmp/docs/_generated/visual-proofs'));
    assert.equal(result.skipValidate, true);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'renderPayloadDir'), false);
  });

  it('resolveDoctorContext falls back to generated/visual-proofs when proof-dir is missing', () => {
    const parsed = {};
    const systemCtx = {
      paths: {
        docs: '/system/docs/components',
        specs: '/system/docs/_spec/components',
        tokenRegistry: '/system/docs/_generated/token-registry.json',
        registry: '/system/docs/_generated/component-registry.json',
        generated: '/system/docs/_generated',
      },
    };

    const result = resolveDoctorContext(parsed, systemCtx, '/repo');
    assert.equal(result.visualProofDir, path.resolve('/system/docs/_generated/visual-proofs'));
  });
});
