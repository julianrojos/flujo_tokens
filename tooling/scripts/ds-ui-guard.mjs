#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');
const srcRoot = path.join(projectRoot, 'apps/ds-dashboard/src');
const featuresRoot = path.join(srcRoot, 'features');
const overlayModalPath = path.join(srcRoot, 'components/ui/overlay/modal.tsx');

/**
 * Recursively collect files with the target extension.
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
function collectTsxFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsxFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.tsx')) out.push(fullPath);
  }
  return out;
}

/**
 * Build violations for every match of a regex in file lines.
 * @param {string} filePath
 * @param {RegExp} pattern
 * @param {string} code
 * @param {string} message
 * @returns {Array<{file:string,line:number,code:string,message:string,match:string}>}
 */
function findLineViolations(filePath, pattern, code, message) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const relPath = path.relative(projectRoot, filePath);
  const violations = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    pattern.lastIndex = 0;
    const match = pattern.exec(line);
    if (match) {
      violations.push({
        file: relPath,
        line: i + 1,
        code,
        message,
        match: match[0],
      });
    }
  }
  return violations;
}

const prohibitedStatusColors =
  /\b(?:bg|text|border)-(?:red|emerald|amber|green|yellow)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const darkPrefixPattern = /\bdark:[^\s"']+/g;

const featureFiles = collectTsxFiles(featuresRoot);
const srcFiles = collectTsxFiles(srcRoot);
const violations = [];

for (const filePath of featureFiles) {
  violations.push(
    ...findLineViolations(
      filePath,
      prohibitedStatusColors,
      'UI02',
      'Raw status color class in features/ is forbidden. Use semantic tokens or StatusAlert/Badge variants.',
    ),
  );

  violations.push(
    ...findLineViolations(
      filePath,
      darkPrefixPattern,
      'UI02',
      'dark: prefix is forbidden in DS Dashboard UI (dark-first identity).',
    ),
  );
}

for (const filePath of srcFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('createPortal')) continue;
  if (path.resolve(filePath) === path.resolve(overlayModalPath)) continue;

  violations.push({
    file: path.relative(projectRoot, filePath),
    line: 1,
    code: 'UI02',
    message:
      'createPortal is only allowed in components/ui/overlay/modal.tsx. Migrate to Modal wrapper.',
    match: 'createPortal',
  });
}

if (violations.length === 0) {
  console.log('UI guard passed: no style-contract violations detected.');
  process.exit(0);
}

console.error(`UI guard failed with ${violations.length} violation(s):`);
for (const violation of violations) {
  console.error(
    `- [${violation.code}] ${violation.file}:${violation.line} ${violation.message} (match: ${violation.match})`,
  );
}

process.exit(1);
