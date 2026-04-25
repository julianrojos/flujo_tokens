import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { Hono } from "hono";

import { handleComponentCatalogRoute } from "./catalog-route-handler-service.ts";

test("component catalog leaves missing visual proof dimensions unset", async () => {
  const repoRoot = path.resolve(process.cwd());
  const proofImageRel =
    'design-systems/simple-design-system-community/docs/_generated/visual-proofs/images/calendar-month-field.png';
  const proofImageAbs = path.join(repoRoot, proofImageRel);

  assert.ok(fs.existsSync(proofImageAbs), `missing fixture image: ${proofImageAbs}`);

  const componentRepo = {
    async getAll(systemId: string) {
      assert.equal(systemId, 'sys-legacy-proof');
      return [
        {
          slug: 'calendar-month-field',
          name: 'Calendar Month Field',
          editorialExists: false,
          figmaFileUrl: 'https://figma.com/file/ABC123',
          figmaComponentSetNodeId: '9:9',
          figma: {
            pageName: 'Components',
          },
          visualProofs: [
            {
              imagePath: proofImageRel,
              screenshotUrl: 'https://cdn.example.com/calendar-month-field.png',
              capturedAt: '2026-03-31T12:00:00.000Z',
              capturedAtEpoch: 1774958400,
              nodeId: '9:9',
              imageSha256: 'sha256',
              imageBytes: 12345,
              imageContentType: 'image/png',
              imageWidth: null,
              imageHeight: null,
              variantsCount: 0,
              variants: [],
            },
          ],
        },
      ];
    },
  };

  const app = new Hono();
  app.get('/api/component-catalog', (c) =>
    handleComponentCatalogRoute(c, {
      failJson: (ctx: any, status: number, payload: any) => ctx.json(payload, status),
      getSystemContext: () => ({ systemId: 'sys-legacy-proof', repoRoot }),
      componentRepo,
      repoRoot,
    } as any),
  );

  const res = await app.request('http://localhost/api/component-catalog');
  assert.equal(res.status, 200);

  const payload = await res.json();
  const component = payload.components.find(
    (entry: any) => entry.slug === 'calendar-month-field',
  );

  assert.ok(component, 'expected calendar-month-field in payload');
  assert.equal(component.visual_proof.image_width, null);
  assert.equal(component.visual_proof.image_height, null);
  assert.equal(component.visual_proof.image_path, proofImageRel);
});
