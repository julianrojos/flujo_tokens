export const MAX_OPENROUTER_SUGGESTIONS = 20;

const OPENROUTER_MODEL_LINK_PATTERN = /href="\/models\/([^"]+)"/g;

export function decodeOpenRouterSlug(rawSlug) {
  const trimmed = String(rawSlug || '').split(/[?#]/)[0].trim();
  if (!trimmed) {
    return '';
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function isValidOpenRouterModelSlug(slug) {
  return /^[^/]+\/[^/]+$/.test(String(slug || '').trim());
}

export function extractTopOpenRouterModelSlugs(html, limit = MAX_OPENROUTER_SUGGESTIONS) {
  const slugs = [];
  const seen = new Set();

  for (const match of String(html || '').matchAll(OPENROUTER_MODEL_LINK_PATTERN)) {
    const candidate = decodeOpenRouterSlug(match[1]);
    if (!isValidOpenRouterModelSlug(candidate)) {
      continue;
    }
    if (seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    slugs.push(candidate);
    if (slugs.length >= limit) {
      break;
    }
  }

  return slugs;
}

export function fallbackLabelFromSlug(slug) {
  return String(slug || '')
    .split('/')
    .pop()
    ?.replace(/[-_:]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}
