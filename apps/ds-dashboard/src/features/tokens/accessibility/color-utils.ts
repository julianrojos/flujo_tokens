interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE =
  /^rgba?\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*(?:,\s*([+-]?\d*(?:\.\d+)?)\s*)?\)$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundChannel(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function channelToHex(value: number): string {
  return roundChannel(value).toString(16).padStart(2, "0");
}

function parseHex(raw: string): RgbaColor | null {
  const source = String(raw || "").trim();
  const match = source.match(HEX_RE);
  if (!match) return null;
  const body = match[1].toLowerCase();

  if (body.length === 3) {
    const r = parseInt(`${body[0]}${body[0]}`, 16);
    const g = parseInt(`${body[1]}${body[1]}`, 16);
    const b = parseInt(`${body[2]}${body[2]}`, 16);
    return { r, g, b, a: 1 };
  }

  if (body.length === 4) {
    const r = parseInt(`${body[0]}${body[0]}`, 16);
    const g = parseInt(`${body[1]}${body[1]}`, 16);
    const b = parseInt(`${body[2]}${body[2]}`, 16);
    const a = parseInt(`${body[3]}${body[3]}`, 16) / 255;
    return { r, g, b, a };
  }

  if (body.length === 6) {
    const r = parseInt(body.slice(0, 2), 16);
    const g = parseInt(body.slice(2, 4), 16);
    const b = parseInt(body.slice(4, 6), 16);
    return { r, g, b, a: 1 };
  }

  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  const a = parseInt(body.slice(6, 8), 16) / 255;
  return { r, g, b, a };
}

function parseRgb(raw: string): RgbaColor | null {
  const match = String(raw || "").trim().match(RGB_RE);
  if (!match) return null;
  const r = clamp(Number(match[1]), 0, 255);
  const g = clamp(Number(match[2]), 0, 255);
  const b = clamp(Number(match[3]), 0, 255);
  const a = match[4] === undefined ? 1 : clamp(Number(match[4]), 0, 1);
  return { r, g, b, a };
}

export function parseCssColor(raw: string): RgbaColor | null {
  const source = String(raw || "").trim();
  if (!source) return null;
  return parseHex(source) || parseRgb(source);
}

function compositeOver(background: RgbaColor, foreground: RgbaColor): RgbaColor {
  const fgAlpha = clamp(foreground.a, 0, 1);
  const bgAlpha = clamp(background.a, 0, 1);
  const outAlpha = fgAlpha + bgAlpha * (1 - fgAlpha);
  if (outAlpha <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const blendChannel = (fgChannel: number, bgChannel: number) =>
    (fgChannel * fgAlpha + bgChannel * bgAlpha * (1 - fgAlpha)) / outAlpha;

  return {
    r: blendChannel(foreground.r, background.r),
    g: blendChannel(foreground.g, background.g),
    b: blendChannel(foreground.b, background.b),
    a: outAlpha,
  };
}

const WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };

function flattenToOpaque(color: RgbaColor): RgbaColor {
  if (color.a >= 0.999) return { ...color, a: 1 };
  return compositeOver(WHITE, color);
}

function linearizeSrgb(channel: number): number {
  const normalized = roundChannel(channel) / 255;
  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(opaque: RgbaColor): number {
  const r = linearizeSrgb(opaque.r);
  const g = linearizeSrgb(opaque.g);
  const b = linearizeSrgb(opaque.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function computeContrastRatio(backgroundCssColor: string, foregroundCssColor: string): number {
  const backgroundRaw = parseCssColor(backgroundCssColor);
  const foregroundRaw = parseCssColor(foregroundCssColor);
  if (!backgroundRaw || !foregroundRaw) {
    throw new Error("Unable to compute contrast ratio: invalid CSS color input.");
  }

  const background = flattenToOpaque(backgroundRaw);
  const foreground = flattenToOpaque(compositeOver(background, foregroundRaw));

  const lumBg = relativeLuminance(background);
  const lumFg = relativeLuminance(foreground);
  const lighter = Math.max(lumBg, lumFg);
  const darker = Math.min(lumBg, lumFg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function normalizeToHex6(rawCssColor: string): string | null {
  const parsed = parseCssColor(rawCssColor);
  if (!parsed) return null;
  const opaque = flattenToOpaque(parsed);
  return `#${channelToHex(opaque.r)}${channelToHex(opaque.g)}${channelToHex(opaque.b)}`;
}
