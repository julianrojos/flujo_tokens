/**
 * StatusIndicator
 *
 * Large, designer-friendly connection state indicator.
 * Shows a coloured dot + label.
 * Port numbers are intentionally hidden from this view.
 */

import React from 'react';
import { COLOR, FONT, SPACE, RADIUS } from '../styles/tokens';
import type { ConnectionState } from '../../services/mcp-client';

interface StatusIndicatorProps {
  connectionState: ConnectionState | null;
}

function getStatusConfig(state: ConnectionState['state'] | undefined): {
  color: string;
  label: string;
  sublabel: string;
} {
  switch (state) {
    case 'connected':    return { color: COLOR.connected,    label: 'Connected',     sublabel: 'MCP session is active for this file' };
    case 'connecting':   return { color: COLOR.mismatch,     label: 'Connecting…',   sublabel: 'Checking Dashboard and MCP session' };
    case 'disconnected': return { color: COLOR.disconnected, label: 'Disconnected',  sublabel: 'No active MCP session for this file' };
    case 'mismatch':     return { color: COLOR.mismatch,     label: 'Port mismatch', sublabel: 'Session active on a different MCP port' };
    case 'fallback':     return { color: COLOR.fallback,     label: 'Fallback port', sublabel: 'Session active on fallback MCP port' };
    default:             return { color: COLOR.unknown,      label: 'Checking…',     sublabel: '' };
  }
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  connectionState,
}) => {
  const { color, label, sublabel } = getStatusConfig(connectionState?.state);
  const isConnecting = connectionState?.state === 'connecting';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: `${SPACE.xl}px ${SPACE.lg}px`,
      backgroundColor: COLOR.surface,
      position: 'relative',
    }}>
      {isConnecting && (
        <style>
          {`
            @keyframes ds-connecting-pulse {
              0% {
                transform: scale(0.95);
                box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7);
              }
              70% {
                transform: scale(1);
                box-shadow: 0 0 0 16px rgba(245, 158, 11, 0);
              }
              100% {
                transform: scale(0.95);
                box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
              }
            }
          `}
        </style>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.xs,
      }}>
        {/* Status dot */}
        <div style={{
          width: 12,
          height: 12,
          borderRadius: RADIUS.full,
          backgroundColor: color,
          transition: 'background-color 0.3s',
          animation: isConnecting ? 'ds-connecting-pulse 1.6s infinite' : undefined,
        }} />

        {/* Label */}
        <span style={{
          fontSize: 14,
          fontWeight: FONT.weight.semibold,
          color: COLOR.textPrimary,
          lineHeight: FONT.lineHeight.tight,
          fontFamily: FONT.family,
          letterSpacing: '-0.01em',
        }}>
          {label}
        </span>
      </div>

      {/* Sublabel */}
      {sublabel && (
        <span style={{
          fontSize: FONT.size.sm,
          color: COLOR.textMuted,
          fontFamily: FONT.family,
          marginTop: SPACE.xs,
        }}>
          {sublabel}
        </span>
      )}
    </div>
  );
};
