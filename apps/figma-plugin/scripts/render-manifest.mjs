import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const manifestTemplatePath = path.join(root, 'manifest.template.json');
const manifestPath = path.join(root, 'manifest.json');

function parseCommaSeparated(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function normalizeApiAllowedDomain(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (isLocalHostname(parsed.hostname)) return null;

    if (!parsed.pathname || parsed.pathname === '/') {
      return parsed.origin;
    }

    const pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
    return `${parsed.origin}${pathname}`;
  } catch {
    return null;
  }
}

function normalizeWsAllowedDomain(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return null;
    if (isLocalHostname(parsed.hostname)) return null;

    if (!parsed.pathname || parsed.pathname === '/') {
      return parsed.origin;
    }

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function deriveWsAllowedDomainFromApiUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (isLocalHostname(parsed.hostname)) return null;

    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/ws/figma-plugin';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function needsReasoning(domains) {
  return domains.some((domain) => {
    const normalized = String(domain || '').trim();
    return normalized === '*' || isLocalHostname(new URL(normalized, 'http://placeholder').hostname);
  });
}

const manifest = JSON.parse(fs.readFileSync(manifestTemplatePath, 'utf8'));
const networkAccess = manifest.networkAccess ?? {};
const generatedAllowedDomains = [];

const extraAllowedDomains = parseCommaSeparated(process.env.FIGMA_PLUGIN_ALLOWED_DOMAINS);
generatedAllowedDomains.push(...extraAllowedDomains);

const apiAllowedDomain = normalizeApiAllowedDomain(process.env.VITE_API_URL);
if (apiAllowedDomain) {
  generatedAllowedDomains.push(apiAllowedDomain);
}

const wsAllowedDomain =
  normalizeWsAllowedDomain(process.env.VITE_DIRECT_WS_URL) ||
  deriveWsAllowedDomainFromApiUrl(process.env.VITE_API_URL);
if (wsAllowedDomain) {
  generatedAllowedDomains.push(wsAllowedDomain);
}

const nextAllowedDomains = generatedAllowedDomains.length > 0
  ? Array.from(new Set(generatedAllowedDomains))
  : Array.isArray(networkAccess.allowedDomains)
    ? networkAccess.allowedDomains.map((entry) => String(entry))
    : [];

const nextNetworkAccess = {
  ...networkAccess,
  allowedDomains: nextAllowedDomains,
};

if (nextAllowedDomains.length > 0 && nextAllowedDomains[0] !== 'none') {
  if (!nextNetworkAccess.reasoning && needsReasoning(nextAllowedDomains)) {
    nextNetworkAccess.reasoning = 'Plugin network access is limited to approved dashboard and bridge endpoints.';
  }
}

manifest.networkAccess = nextNetworkAccess;

const nextManifest = `${JSON.stringify(manifest, null, 2)}\n`;
fs.writeFileSync(manifestPath, nextManifest, 'utf8');
