import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const distDir = path.join(root, 'dist');
const templatePath = path.join(root, 'ui.runtime.html');
const uiJsPath = path.join(distDir, 'ui.js');
const outPath = path.join(distDir, 'ui.html');

const template = fs.readFileSync(templatePath, 'utf8');
const uiJs = fs.readFileSync(uiJsPath, 'utf8');

if (!template.includes('__INLINE_UI_JS__')) {
  throw new Error('ui.runtime.html is missing __INLINE_UI_JS__ placeholder');
}

const html = template.replace('__INLINE_UI_JS__', uiJs);
fs.writeFileSync(outPath, html, 'utf8');
