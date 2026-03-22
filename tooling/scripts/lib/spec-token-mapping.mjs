import { isPlainObject } from "./is-plain-object.mjs";
import { isTbdMarker } from "./tbd.mjs";

export function normalizeCompareKey(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function extractUniqueRegistryEntries(registryIndex) {
  const unique = [];
  const seen = new Set();

  for (const entry of Object.values(registryIndex || {})) {
    if (!entry || typeof entry !== "object") continue;
    const marker = [
      String(entry.path || ""),
      String(entry.slashPath || ""),
      String(entry.cssVar || ""),
      String(entry.collection || ""),
    ].join("|");
    if (seen.has(marker)) continue;
    seen.add(marker);
    unique.push(entry);
  }

  return unique;
}

export function pickComponentTokenCandidates(registryEntries, componentName) {
  const componentKey = normalizeCompareKey(componentName);
  if (!componentKey) return [];

  const matches = [];
  for (const entry of registryEntries) {
    if (!entry.path || !String(entry.path).includes(".")) continue;
    if (String(entry.collection || "").toLowerCase() !== "components") continue;
    const parts = String(entry.path).split(".");
    if (parts.length < 3) continue;
    if (normalizeCompareKey(parts[1]) !== componentKey) continue;
    matches.push(entry);
  }
  return matches;
}

export function buildTokenMenuLines(registryEntries, componentName, limit = 24) {
  const preferred = pickComponentTokenCandidates(
    registryEntries,
    componentName,
  );
  const fallback = registryEntries.filter((entry) => {
    const collection = String(entry.collection || "").toLowerCase();
    return collection === "semantic" || collection === "primitives";
  });
  const source = preferred.length > 0 ? preferred : fallback;
  const selected = source.slice(0, Math.max(0, limit));
  return selected.map((entry) => {
    const tokenPath = String(entry.slashPath || entry.path || "").trim();
    const tokenType = String(entry.type || "unknown").trim();
    const resolved = String(entry.resolvedValue || "").trim();
    return resolved
      ? `${tokenPath} (${tokenType}: ${resolved})`
      : `${tokenPath} (${tokenType})`;
  });
}

function extractKeywords(raw) {
  const stopWords = new Set([
    "default",
    "state",
    "type",
    "variant",
    "token",
    "tokens",
    "value",
    "values",
  ]);
  return String(raw || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part && !stopWords.has(part));
}

function scoreTokenCandidate(entry, keywords) {
  const haystack =
    `${String(entry.path || "")} ${String(entry.slashPath || "")}`.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (!keyword) continue;
    if (haystack.includes(keyword)) score += 1;
  }

  return score;
}

export function pickBestTokenPath(candidates, keyPath, condition) {
  const keywords = extractKeywords(`${keyPath} ${condition}`);
  if (keywords.length === 0) return "";

  let best = null;
  let bestScore = 0;
  let bestScoreCount = 0;
  for (const candidate of candidates) {
    const score = scoreTokenCandidate(candidate, keywords);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
      bestScoreCount = score > 0 ? 1 : 0;
      continue;
    }
    if (score === bestScore && best && score > 0) {
      bestScoreCount += 1;
      const currentLen = String(candidate.path || "").length;
      const bestLen = String(best.path || "").length;
      if (currentLen < bestLen) best = candidate;
    }
  }

  const isStrongMatch = bestScore >= 2;
  const isUniqueSingleKeywordMatch = bestScore === 1 && bestScoreCount === 1;
  if (!best || (!isStrongMatch && !isUniqueSingleKeywordMatch)) return "";
  return String(best.slashPath || best.path || "").trim();
}

export function prefillTokenMapping(
  node,
  componentTokenCandidates,
  keyPath = "",
) {
  if (!isPlainObject(node)) return 0;
  let filledCount = 0;

  const entries = Object.entries(node);
  const isConditionMap =
    entries.length > 0 &&
    entries.every(([, value]) => typeof value === "string");

  if (isConditionMap) {
    for (const [condition, value] of entries) {
      if (!isTbdMarker(value)) continue;
      const suggestion = pickBestTokenPath(
        componentTokenCandidates,
        keyPath,
        condition,
      );
      if (!suggestion) continue;
      node[condition] = suggestion;
      filledCount += 1;
    }
    return filledCount;
  }

  for (const [key, value] of entries) {
    const nextPath = keyPath ? `${keyPath}.${key}` : key;

    if (typeof value === "string") {
      if (!isTbdMarker(value)) continue;
      const suggestion = pickBestTokenPath(
        componentTokenCandidates,
        nextPath,
        key,
      );
      if (!suggestion) continue;
      node[key] = suggestion;
      filledCount += 1;
      continue;
    }

    if (isPlainObject(value)) {
      filledCount += prefillTokenMapping(
        value,
        componentTokenCandidates,
        nextPath,
      );
    }
  }

  return filledCount;
}

