/**
 * StatusIndicator
 *
 * Large, designer-friendly connection state indicator.
 * Shows a coloured dot + label + design system name.
 * Port numbers are intentionally hidden from this view.
 */

import React from 'react';
import { COLOR, FONT, SPACE, RADIUS } from '../styles/tokens';
import type { ConnectionState } from '../../services/mcp-client';

interface StatusIndicatorProps {
  connectionState: ConnectionState | null;
  docName: string;
}

function getStatusConfig(state: ConnectionState['state'] | undefined): {
  color: string;
  label: string;
  sublabel: string;
} {
  switch (state) {
    case 'connected':    return { color: COLOR.connected,    label: 'Connected',     sublabel: 'MCP session is active for this file' };
    case 'connecting':   return { color: COLOR.warning,      label: 'Connecting…',   sublabel: 'Trying to connect to Dashboard and MCP session' };
    case 'disconnected': return { color: COLOR.disconnected, label: 'Disconnected',  sublabel: 'MCP is not linked to the current Figma file' };
    case 'mismatch':     return { color: COLOR.connected,    label: 'Connected',      sublabel: 'Direct MCP session is active' };
    case 'fallback':     return { color: COLOR.connected,    label: 'Connected',      sublabel: 'Direct MCP session is active' };
    default:             return { color: COLOR.unknown,      label: 'Checking…',     sublabel: '' };
  }
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  connectionState,
  docName,
}) => {
  const { color, label, sublabel } = getStatusConfig(connectionState?.state);
  const isConnecting = connectionState?.state === 'connecting';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
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

      {/* Status dot with glow */}
      <div style={{
        width: 48,
        height: 48,
        borderRadius: RADIUS.full,
        backgroundColor: color,
        boxShadow: `0 0 0 8px ${color}22`,
        marginBottom: SPACE.md,
        transition: 'background-color 0.3s, box-shadow 0.3s',
        animation: isConnecting ? 'ds-connecting-pulse 1.6s infinite' : undefined,
      }} />

      {/* Label */}
      <span style={{
        fontSize: FONT.size.h1,
        fontWeight: FONT.weight.semibold,
        color: COLOR.textPrimary,
        lineHeight: FONT.lineHeight.tight,
        marginBottom: SPACE.xs,
        fontFamily: FONT.family,
        letterSpacing: '-0.01em',
      }}>
        {label}
      </span>

      {/* Sublabel */}
      {sublabel && (
        <span style={{
          fontSize: FONT.size.sm,
          color: COLOR.textMuted,
          fontFamily: FONT.family,
          marginBottom: docName ? SPACE.md : 0,
        }}>
          {sublabel}
        </span>
      )}

      {/* Document / design system name */}
      {docName && (
        <span style={{
          fontSize: FONT.size.sm,
          fontWeight: FONT.weight.medium,
          color: COLOR.textSecondary,
          fontFamily: FONT.family,
          backgroundColor: COLOR.bg,
          padding: `${SPACE.xs / 2}px ${SPACE.sm}px`,
          borderRadius: RADIUS.full,
          border: `1px solid ${COLOR.border}`,
          maxWidth: '80%',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}>
          {docName}
        </span>
      )}
    </div>
  );
};
