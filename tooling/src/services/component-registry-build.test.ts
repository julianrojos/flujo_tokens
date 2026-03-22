import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { buildComponentRegistry } from './component-registry-build.js';
import { PROJECT_ROOT } from '../utils/system-context.js';

function toProjectRelativePosix(absolutePath: string): string {
  return path.relative(PROJECT_ROOT, absolutePath).split(path.sep).join('/');
}

describe('component-registry-build', () => {
  it('resolves visual proof image_path relative to the system docs root', () => {
    const tmpBaseDir = path.join(PROJECT_ROOT, 'tooling', '.tmp');
    fs.mkdirSync(tmpBaseDir, { recursive: true });
    const tempRoot = fs.mkdtempSync(
      path.join(tmpBaseDir, 'component-registry-build-'),
    );
    try {
      const docsRoot = path.join(tempRoot, 'docs', 'sample-system');
      const specsDir = path.join(docsRoot, '_spec', 'components');
      const docsDir = path.join(docsRoot, 'components');
      const proofsDir = path.join(docsRoot, '_generated', 'visual-proofs');
      const renderDir = path.join(docsRoot, '_generated', 'figma_doc_models');
      const imagesDir = path.join(proofsDir, 'images');
      const variantsDir = path.join(imagesDir, 'variants');
      fs.mkdirSync(specsDir, { recursive: true });
      fs.mkdirSync(docsDir, { recursive: true });
      fs.mkdirSync(renderDir, { recursive: true });
      fs.mkdirSync(variantsDir, { recursive: true });

      const imagePath = path.join(imagesDir, 'bot_n.png');
      const variantImagePath = path.join(variantsDir, 'bot_n__01__variant_default.png');
      fs.writeFileSync(imagePath, 'fake-png', 'utf8');
      fs.writeFileSync(variantImagePath, 'fake-png-variant', 'utf8');

      fs.writeFileSync(
        path.join(proofsDir, 'bot_n.json'),
        JSON.stringify(
          {
            source_url: 'https://www.figma.com/file/FILE/Caca?node-id=1:23',
            node_id: '1:23',
            screenshot_url: 'https://example.com/image.png',
            image_path: '_generated/visual-proofs/images/bot_n.png',
            variants: [
              {
                name: 'Variant=Default',
                node_id: '1:22',
                image_path:
                  '_generated/visual-proofs/images/variants/bot_n__01__variant_default.png',
              },
            ],
          },
          null,
          2,
        ),
        'utf8',
      );

      const registry = buildComponentRegistry({
        specsDir,
        docsDir,
        proofsDir,
        renderDir,
      });
      assert.equal(registry.components.length, 1);
      const component = registry.components[0];
      assert.equal(
        component.visual_proof.image_path,
        toProjectRelativePosix(imagePath),
      );
      assert.equal(component.visual_proof.variants.length, 1);
      assert.equal(
        component.visual_proof.variants[0].image_path,
        toProjectRelativePosix(variantImagePath),
      );
      assert.equal(component.pipeline_stage, 'visual-proof');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('excludes component variants from registry when they belong to a VARIANT component set', () => {
    const tmpBaseDir = path.join(PROJECT_ROOT, 'tooling', '.tmp');
    fs.mkdirSync(tmpBaseDir, { recursive: true });
    const tempRoot = fs.mkdtempSync(
      path.join(tmpBaseDir, 'component-registry-build-'),
    );
    try {
      const docsRoot = path.join(tempRoot, 'docs', 'sample-system');
      const specsDir = path.join(docsRoot, '_spec', 'components');
      const docsDir = path.join(docsRoot, 'components');
      const proofsDir = path.join(docsRoot, '_generated', 'visual-proofs');
      const renderDir = path.join(docsRoot, '_generated', 'figma_doc_models');
      fs.mkdirSync(specsDir, { recursive: true });
      fs.mkdirSync(docsDir, { recursive: true });
      fs.mkdirSync(proofsDir, { recursive: true });
      fs.mkdirSync(renderDir, { recursive: true });

      fs.writeFileSync(
        path.join(specsDir, 'boton.yml'),
        [
          'name: boton',
          'figma:',
          "  component_set_node_id: '1:23'",
          'properties:',
          '  - name: Variant',
          '    type: VARIANT',
          'anatomy:',
          "  - id: '1:22'",
          '    type: COMPONENT',
          "  - id: '1:24'",
          '    type: COMPONENT',
          '',
        ].join('\n'),
        'utf8',
      );
      fs.writeFileSync(
        path.join(specsDir, 'variant_default.yml'),
        [
          'name: variant_default',
          'figma:',
          "  component_set_node_id: '1:22'",
          'properties: []',
          'anatomy: []',
          '',
        ].join('\n'),
        'utf8',
      );
      fs.writeFileSync(
        path.join(specsDir, 'variant_accent.yml'),
        [
          'name: variant_accent',
          'figma:',
          "  component_set_node_id: '1:24'",
          'properties: []',
          'anatomy: []',
          '',
        ].join('\n'),
        'utf8',
      );

      fs.writeFileSync(path.join(docsDir, 'boton.md'), '# Boton\n', 'utf8');
      fs.writeFileSync(path.join(docsDir, 'variant_default.md'), '# VariantDefault\n', 'utf8');
      fs.writeFileSync(path.join(docsDir, 'variant_accent.md'), '# VariantAccent\n', 'utf8');

      const registry = buildComponentRegistry({
        specsDir,
        docsDir,
        proofsDir,
        renderDir,
      });

      assert.deepEqual(
        registry.components.map((item) => item.slug),
        ['boton'],
      );
      assert.equal(registry.summary.total_components, 1);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
