/**
 * SyncButton
 *
 * Triggers a token sync via POST /api/figma-mcp-variables.
 * State machine: idle → syncing → success → idle (4s)
 *                              └→ error   → idle (on click)
 */

import React, { useState, useRef } from 'react';
import { getPluginMcpClient } from '../../services/mcp-client';
import { COLOR, FONT, SPACE, RADIUS } from '../styles/tokens';

type SyncState = 'idle' | 'syncing' | 'success' | 'error';

interface SyncButtonProps {
  onSyncComplete?: () => void;
  onSyncError?: (error: string) => void;
  figmaUrl?: string;
}

const STATE_CONFIG: Record<SyncState, { label: string; bg: string; fg: string; border: string; icon: string }> = {
  idle: { label: 'Sync Tokens', bg: COLOR.accent, fg: COLOR.accentText, border: COLOR.accent, icon: '↻' },
  syncing: { label: 'Syncing…', bg: COLOR.accentHover, fg: COLOR.accentText, border: COLOR.accentHover, icon: '↻' },
  success: { label: 'Tokens synced', bg: COLOR.successBg, fg: COLOR.successText, border: COLOR.success, icon: '✓' },
  error: { label: 'Retry sync', bg: COLOR.dangerBg, fg: COLOR.dangerText, border: COLOR.danger, icon: '↻' },
};

export const SyncButton: React.FC<SyncButtonProps> = ({ onSyncComplete, onSyncError, figmaUrl }) => {
  const [state, setState] = useState<SyncState>('idle');
  const [errMsg, setErrMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = getPluginMcpClient();

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

  const { label, bg, fg, border, icon } = STATE_CONFIG[state];

  return (
    <div style={{ padding: `${SPACE.sm}px ${SPACE.lg}px ${SPACE.lg}px` }}>
      <button
        onClick={handleClick}
        disabled={state === 'syncing'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SPACE.sm,
          width: '100%',
          padding: `${SPACE.sm + 2}px ${SPACE.lg}px`,
          backgroundColor: bg,
          color: fg,
          border: `1px solid ${border}`,
          borderRadius: RADIUS.md,
          fontSize: FONT.size.xl,
          fontWeight: FONT.weight.semibold,
          fontFamily: FONT.family,
          cursor: state === 'syncing' ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s, color 0.2s, border-color 0.2s',
          outline: 'none',
        }}
      >
        <span style={{ display: 'inline-block', animation: state === 'syncing' ? 'spin 1s linear infinite' : 'none', lineHeight: 1 }}>
          {icon}
        </span>
        {label}
      </button>

      {state === 'error' && errMsg && (
        <p style={{ margin: `${SPACE.sm}px 0 0`, fontSize: FONT.size.sm, color: COLOR.dangerText, fontFamily: FONT.family, lineHeight: FONT.lineHeight.normal }}>
          {errMsg}
        </p>
      )}
    </div>
  );
};
