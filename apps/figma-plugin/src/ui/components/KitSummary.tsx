/**
 * KitSummary
 *
 * Compact design system stats: variable count, collection count,
 * style breakdown, and relative timestamp. Auto-refreshes every 30s.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getPluginMcpClient, type KitSummary as KitSummaryData } from '../../services/mcp-client';
import { COLOR, FONT, SPACE, RADIUS } from '../styles/tokens';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STYLE_LABELS: Record<string, string> = {
  FILL: 'color',
  TEXT: 'text',
  EFFECT: 'effect',
  GRID: 'grid',
};

function formatStyles(stylesByType: Record<string, number>): string {
  return Object.entries(stylesByType)
    .map(([t, n]) => `${n} ${STYLE_LABELS[t] ?? t.toLowerCase()}`)
    .join(' · ');
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface KitSummaryProps {
  /** Incrementing this value triggers a re-fetch (e.g., after sync). */
  refreshSignal?: number;
}

export const KitSummary: React.FC<KitSummaryProps> = ({ refreshSignal }) => {
  const [summary, setSummary] = useState<KitSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  const client = getPluginMcpClient();

  const fetchKit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const kit = await client.getDesignSystemKit();
      const data = client.computeKitSummary(kit);
      if (data) setSummary(data);
      else setError(!kit.ok ? kit.message : 'No data');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { fetchKit(); }, [fetchKit, refreshSignal]);

  useEffect(() => {
    const id = setInterval(fetchKit, 30_000);
    return () => clearInterval(id);
  }, [fetchKit]);

  // Tick every 30s to update relative timestamps without fetching
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading && !summary) {
    return (
      <div style={card}>
        {[72, 52, 40].map((w, i) => (
          <div key={i} style={{
            height: 12,
            width: w,
            backgroundColor: COLOR.border,
            borderRadius: RADIUS.sm,
            marginBottom: i < 2 ? SPACE.sm : 0,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error && !summary) {
    return (
      <div style={{ ...card, backgroundColor: COLOR.bg, borderColor: COLOR.border }}>
        <span style={{ fontSize: FONT.size.sm, color: COLOR.textSecondary, fontFamily: FONT.family }}>
          Items to export: none yet
        </span>
        <p style={{ margin: `${SPACE.xs}px 0 0 0`, fontSize: FONT.size.xs, color: COLOR.textMuted, fontFamily: FONT.family }}>
          Keep this plugin open and click "Update variables" to generate export data.
        </p>
      </div>
    );
  }

  if (!summary) return null;

  const totalStyles = Object.values(summary.stylesByType).reduce((a, b) => a + b, 0);
  const styleBreakdown = formatStyles(summary.stylesByType);

  return (
    <div style={card}>
      <Row label="Variables" value={`${summary.variableCount.toLocaleString()} vars · ${summary.collectionCount} ${summary.collectionCount === 1 ? 'collection' : 'collections'}`} />
      {totalStyles > 0 && <Row label="Styles" value={styleBreakdown} />}
      <div style={{ height: 1, backgroundColor: COLOR.border, margin: `${SPACE.sm}px 0` }} />
      <Row label="Fetched" value={timeAgo(summary.fetchedAt)} muted />
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: SPACE.xs }}>
      <span style={{ fontSize: FONT.size.sm, color: muted ? COLOR.textMuted : COLOR.textSecondary, fontFamily: FONT.family, fontWeight: FONT.weight.medium }}>
        {label}
      </span>
      <span style={{ fontSize: FONT.size.sm, color: muted ? COLOR.textMuted : COLOR.textPrimary, fontFamily: FONT.family, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  margin: `0 ${SPACE.lg}px`,
  padding: SPACE.md,
  backgroundColor: COLOR.bg,
  borderRadius: RADIUS.md,
  border: `1px solid ${COLOR.border}`,
};
