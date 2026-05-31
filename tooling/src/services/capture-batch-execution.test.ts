import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runCaptureBatch } from './capture-batch-execution.ts';

describe('runCaptureBatch', () => {
  it('keeps image dimensions when node dimensions are missing', () => {
    const result = runCaptureBatch({
      targets: [
        {
          slug: 'calendar-month-field',
          nodeId: '123:456',
          nodeUrl: 'https://www.figma.com/file/file-key?node-id=123%3A456',
          name: 'Calendar Month Field',
        },
      ],
      repoRoot: '/repo',
      captureScriptPath: '/repo/tooling/src/runners/capture-visual-proof-runner.ts',
      runScriptJson: () => ({
        screenshotUrl: 'https://example.com/calendar-month-field.png',
        localImagePath: '/repo/design-systems/acme/docs/proofs/calendar-month-field.png',
        variantsCount: 0,
        capturedAt: '2026-04-23T10:00:00.000Z',
        imageSha256: 'sha256',
        imageBytes: 1234,
        imageContentType: 'image/png',
        imageWidth: 241,
        imageHeight: 29,
        nodeWidth: null,
        nodeHeight: null,
        variants: [],
      }),
      continueOnError: true,
      figmaToken: 'figma-token',
      format: 'png',
      scale: 2,
      proofDir: '/repo/design-systems/acme/docs/proofs',
      proofImageDir: '/repo/design-systems/acme/docs/proofs/images',
      includeVariants: true,
      variantLimit: 10,
      agent: 'auto',
      mainCaptureMode: 'rest',
    });

    assert.equal(result.failed.length, 0);
    assert.equal(result.captured.length, 1);
    assert.equal(result.captured[0]?.image_width, 241);
    assert.equal(result.captured[0]?.image_height, 29);
    assert.equal(result.captured[0]?.node_width, null);
    assert.equal(result.captured[0]?.node_height, null);
  });
});
