import { stripDiacritics } from './strip-diacritics.js';

export function toCssVarSuffix(value: string): string {
  return (
    stripDiacritics(String(value || '').trim())
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'token'
  );
}

export function resolveUniqueCssVar(args: {
  baseCssVar: string;
  collection: string;
  variableId: string;
  usedCssVars: Set<string>;
}): string {
  const base = args.baseCssVar || '--token';
  if (!args.usedCssVars.has(base)) {
    args.usedCssVars.add(base);
    return base;
  }

  const candidates = [
    `${base}-${toCssVarSuffix(args.collection)}`,
    `${base}-${toCssVarSuffix(args.variableId)}`,
  ];
  for (const candidate of candidates) {
    if (!args.usedCssVars.has(candidate)) {
      args.usedCssVars.add(candidate);
      return candidate;
    }
  }

  let index = 2;
  let candidate = `${base}-${toCssVarSuffix(args.variableId)}-${index}`;
  while (args.usedCssVars.has(candidate)) {
    index += 1;
    candidate = `${base}-${toCssVarSuffix(args.variableId)}-${index}`;
  }
  args.usedCssVars.add(candidate);
  return candidate;
}
