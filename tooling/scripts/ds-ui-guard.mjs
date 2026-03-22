#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '../..');
const srcRoot = path.join(projectRoot, 'apps/ds-dashboard/src');
const featuresRoot = path.join(srcRoot, 'features');
const componentsRoot = path.join(srcRoot, 'components');
const compositesRoot = path.join(componentsRoot, 'composites');
const uiRoot = path.join(componentsRoot, 'ui');
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

/**
 * Resolve a 1-based line number from a string index.
 * @param {string} content
 * @param {number} index
 * @returns {number}
 */
function lineFromIndex(content, index) {
  if (!Number.isFinite(index) || index <= 0) return 1;
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content[i] === '\n') line += 1;
  }
  return line;
}

/**
 * Find first line with a regex match.
 * @param {string} content
 * @param {RegExp} pattern
 * @returns {number}
 */
function findFirstMatchLine(content, pattern) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    pattern.lastIndex = 0;
    if (pattern.test(lines[i])) return i + 1;
  }
  return 1;
}

const prohibitedStatusColors =
  /\b(?:bg|text|border)-(?:red|emerald|amber|green|yellow)-[0-9]{2,3}(?:\/[0-9]{1,3})?\b/g;
const darkPrefixPattern = /\bdark:[^\s"']+/g;
const featureImportCapturePattern = /from\s+["']@\/features\/([^/"']+)/g;
const featureImportPattern = /from\s+["']@\/features\//;
const compositeImportPattern = /from\s+["']@\/components\/composites\//;
const cvaCallPattern = /\bcva\(/;
const cnCallPattern = /\bcn\(/;
const forwardRefPattern = /\bforwardRef\b/;

const featureFiles = collectTsxFiles(featuresRoot);
const uiFiles = collectTsxFiles(uiRoot);
const compositeFiles = collectTsxFiles(compositesRoot);
const componentFiles = collectTsxFiles(componentsRoot);
const srcFiles = collectTsxFiles(srcRoot);
const violations = [];

for (const filePath of featureFiles) {
  // Single read — reuse content for all per-file checks
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(projectRoot, filePath);

  // UI02: prohibited raw status color classes
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    prohibitedStatusColors.lastIndex = 0;
    const colorMatch = prohibitedStatusColors.exec(lines[i]);
    if (colorMatch) {
      violations.push({
        file: relPath,
        line: i + 1,
        code: 'UI02',
        message: 'Raw status color class in features/ is forbidden. Use semantic tokens or StatusAlert/Badge variants.',
        match: colorMatch[0],
      });
    }
    darkPrefixPattern.lastIndex = 0;
    const darkMatch = darkPrefixPattern.exec(lines[i]);
    if (darkMatch) {
      violations.push({
        file: relPath,
        line: i + 1,
        code: 'UI02',
        message: 'dark: prefix is forbidden in DS Dashboard UI (dark-first identity).',
        match: darkMatch[0],
      });
    }
  }

  // UI01: cross-feature imports
  const relFeaturePath = path.relative(featuresRoot, filePath);
  const sourceFeatureName = relFeaturePath.split(path.sep)[0];
  for (const match of content.matchAll(featureImportCapturePattern)) {
    const targetFeatureName = String(match[1] || '').trim();
    if (!sourceFeatureName || !targetFeatureName || sourceFeatureName === targetFeatureName) continue;
    violations.push({
      file: relPath,
      line: lineFromIndex(content, Number(match.index)),
      code: 'UI01',
      message:
        `Cross-feature import is forbidden (${sourceFeatureName} -> ${targetFeatureName}). Extract shared logic to hooks/lib/composites.`,
      match: match[0],
    });
  }
}

// Scan non-ui, non-composite component files for UI01 (feature imports) and UI02 (color/dark)
// ui/ and composites/ are checked more specifically in their own loops below
const uiAndCompositeSet = new Set([...uiFiles, ...compositeFiles]);
for (const filePath of componentFiles) {
  if (uiAndCompositeSet.has(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(projectRoot, filePath);

  // UI01: no feature imports from components/
  if (featureImportPattern.test(content)) {
    violations.push({
      file: relPath,
      line: findFirstMatchLine(content, featureImportPattern),
      code: 'UI01',
      message: 'components/ layer must not import from features/.',
      match: '@/features/',
    });
  }

  // UI02: no raw palette colors or dark: prefix
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    prohibitedStatusColors.lastIndex = 0;
    const colorMatch = prohibitedStatusColors.exec(lines[i]);
    if (colorMatch) {
      violations.push({
        file: relPath,
        line: i + 1,
        code: 'UI02',
        message: 'Raw status color class in components/ is forbidden. Use semantic tokens.',
        match: colorMatch[0],
      });
    }
    darkPrefixPattern.lastIndex = 0;
    const darkMatch = darkPrefixPattern.exec(lines[i]);
    if (darkMatch) {
      violations.push({
        file: relPath,
        line: i + 1,
        code: 'UI02',
        message: 'dark: prefix is forbidden in DS Dashboard UI (dark-first identity).',
        match: darkMatch[0],
      });
    }
  }
}

for (const filePath of compositeFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (featureImportPattern.test(content)) {
    violations.push({
      file: path.relative(projectRoot, filePath),
      line: findFirstMatchLine(content, featureImportPattern),
      code: 'UI01',
      message: 'composites/ must not import from features/.',
      match: '@/features/',
    });
  }
  if (compositeImportPattern.test(content)) {
    violations.push({
      file: path.relative(projectRoot, filePath),
      line: findFirstMatchLine(content, compositeImportPattern),
      code: 'UI01',
      message: 'composites/ must not import from other composites/.',
      match: '@/components/composites/',
    });
  }
}

for (const filePath of uiFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(projectRoot, filePath);

  if (featureImportPattern.test(content)) {
    violations.push({
      file: relPath,
      line: findFirstMatchLine(content, featureImportPattern),
      code: 'UI01',
      message: 'ui/ primitives must not import from features/.',
      match: '@/features/',
    });
  }
  if (compositeImportPattern.test(content)) {
    violations.push({
      file: relPath,
      line: findFirstMatchLine(content, compositeImportPattern),
      code: 'UI01',
      message: 'ui/ primitives must not import from composites/.',
      match: '@/components/composites/',
    });
  }

  if (!cvaCallPattern.test(content)) {
    violations.push({
      file: relPath,
      line: 1,
      code: 'UI03',
      message: 'ui/ primitive must use cva() for class contract.',
      match: 'cva()',
    });
  }
  if (!cnCallPattern.test(content)) {
    violations.push({
      file: relPath,
      line: 1,
      code: 'UI03',
      message: 'ui/ primitive must compose className with cn().',
      match: 'cn()',
    });
  }
  const isModalFile = path.resolve(filePath) === path.resolve(overlayModalPath);
  if (!isModalFile && !forwardRefPattern.test(content)) {
    violations.push({
      file: relPath,
      line: 1,
      code: 'UI03',
      message: 'ui/ primitive must use React.forwardRef (except modal portal wrappers).',
      match: 'forwardRef',
    });
  }
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
  console.log('UI guard passed: no UI contract violations detected.');
  process.exit(0);
}

console.error(`UI guard failed with ${violations.length} violation(s):`);
for (const violation of violations) {
  console.error(
    `- [${violation.code}] ${violation.file}:${violation.line} ${violation.message} (match: ${violation.match})`,
  );
}

process.exit(1);
