import assert from 'node:assert/strict';
import { test } from 'node:test';

import { captureMainImageViaRest } from './capture-visual-proof-image.ts';

test('REST capture tolerates node metadata lookup failures', async () => {
  const result = await captureMainImageViaRest(
    {
      figmaUrl: 'https://www.figma.com/design/file-key',
      nodeId: '123:456',
      format: 'png',
      scale: 2,
      figmaToken: 'figma-token',
      figmaFileKey: 'file-key',
      agent: 'auto',
      componentSlug: 'calendar-month-field',
      mainCaptureMode: 'rest',
      downloadTimeoutMs: 1000,
    },
    {
      fetchImages: async () => ({
        images: {
          '123:456': 'https://example.com/calendar-month-field.png',
        },
      }),
      fetchNodes: async () => {
        throw new Error('temporary metadata outage');
      },
      warn: () => {},
    },
  );

  assert.equal(result.captureSource, 'REST');
  assert.equal(result.imageUrlRaw, 'https://example.com/calendar-month-field.png');
  assert.equal(result.nodeWidth, null);
  assert.equal(result.nodeHeight, null);
});
