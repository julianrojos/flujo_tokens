/**
 * SyncButton
 *
 * Triggers variable refresh via POST /api/figma-mcp-variables.
 * State machine: idle → syncing → success → idle (4s)
 *                              └→ error   → idle (on click)
 * If already up to date, idle is disabled until a document change arrives.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPluginMcpClient } from '../../services/mcp-client';
import { COLOR, FONT, SPACE, RADIUS } from '../styles/tokens';

type SyncState = 'idle' | 'syncing' | 'success' | 'error';

interface SyncButtonProps {
  onSyncComplete?: () => void;
  onSyncError?: (error: string) => void;
  figmaUrl?: string;
  isUpToDate?: boolean;
  upToDateAtMs?: number | null;
}

const STATE_CONFIG: Record<SyncState, { label: string; bg: string; fg: string; border: string; icon: string }> = {
  idle: { label: 'Update variables', bg: COLOR.accent, fg: COLOR.accentText, border: COLOR.accent, icon: '↻' },
  syncing: { label: 'Updating…', bg: COLOR.accentHover, fg: COLOR.accentText, border: COLOR.accentHover, icon: '↻' },
  success: { label: 'Variables updated', bg: COLOR.successBg, fg: COLOR.successText, border: COLOR.success, icon: '✓' },
  error: { label: 'Retry update', bg: COLOR.dangerBg, fg: COLOR.dangerText, border: COLOR.danger, icon: '↻' },
};

export const SyncButton: React.FC<SyncButtonProps> = ({
  onSyncComplete,
  onSyncError,
  figmaUrl,
  isUpToDate = false,
  upToDateAtMs = null,
}) => {
  const [state, setState] = useState<SyncState>('idle');
  const [errMsg, setErrMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = getPluginMcpClient();

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const scheduleReset = () => {
    timerRef.current = setTimeout(() => {
      setState('idle');
      setErrMsg('');
      timerRef.current = null;
    }, 4_000);
  };

  const handleClick = async () => {
    if (state === 'syncing') return;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    setState('syncing');
    setErrMsg('');

    try {
      const result = await client.syncTokens(figmaUrl);
      if (result.ok) {
        setState('success');
        onSyncComplete?.();
        parent.postMessage({ pluginMessage: { type: 'SYNC_COMPLETE' } }, '*');
      } else {
        const msg = result.message ?? 'Sync failed';
        setState('error');
        setErrMsg(msg);
        onSyncError?.(msg);
        parent.postMessage({ pluginMessage: { type: 'SYNC_ERROR', error: msg } }, '*');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setState('error');
      setErrMsg(msg);
      onSyncError?.(msg);
      parent.postMessage({ pluginMessage: { type: 'SYNC_ERROR', error: msg } }, '*');
    }

    scheduleReset();
  };

  const isDisabled = state === 'syncing' || (state === 'idle' && isUpToDate);
  const { label, bg, fg, border, icon } = STATE_CONFIG[state];
  const displayLabel = state === 'idle' && isUpToDate ? 'Variables up to date' : label;
  const displayIcon = state === 'idle' && isUpToDate ? '✓' : icon;
  const displayBg = state === 'idle' && isUpToDate ? COLOR.surface : bg;
  const displayFg = state === 'idle' && isUpToDate ? COLOR.textSecondary : fg;
  const displayBorder = state === 'idle' && isUpToDate ? COLOR.border : border;
  const upToDateAtLabel = useMemo(() => {
    if (upToDateAtMs == null || !Number.isFinite(upToDateAtMs)) {
      return null;
    }
    const date = new Date(upToDateAtMs);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [upToDateAtMs]);

  return (
    <div style={{ padding: `${SPACE.sm}px ${SPACE.lg}px ${SPACE.lg}px` }}>
      <button
        onClick={handleClick}
        disabled={isDisabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          width: '100%',
          padding: `${SPACE.sm + 2}px ${SPACE.lg}px`,
          backgroundColor: displayBg,
          color: displayFg,
          border: `1px solid ${displayBorder}`,
          borderRadius: RADIUS.md,
          fontSize: FONT.size.xl,
          fontWeight: FONT.weight.semibold,
          fontFamily: FONT.family,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.75 : 1,
          transition: 'background-color 0.2s, color 0.2s, border-color 0.2s',
          outline: 'none',
        }}
      >
        <span style={{ display: 'inline-block', animation: state === 'syncing' ? 'spin 1s linear infinite' : 'none', lineHeight: 1 }}>
          {displayIcon}
        </span>
        {displayLabel}
      </button>

      {state === 'error' && errMsg && (
        <p style={{ margin: `${SPACE.sm}px 0 0`, fontSize: FONT.size.sm, color: COLOR.dangerText, fontFamily: FONT.family, lineHeight: FONT.lineHeight.normal }}>
          {errMsg}
        </p>
      )}
      {state === 'idle' && isUpToDate && upToDateAtLabel && (
        <p
          style={{
            margin: `${SPACE.sm}px 0 0`,
            fontSize: FONT.size.sm,
            color: COLOR.textMuted,
            fontFamily: FONT.family,
            lineHeight: FONT.lineHeight.normal,
            textAlign: 'center',
          }}
        >
          Last update: {upToDateAtLabel}
        </p>
      )}
    </div>
  );
};
