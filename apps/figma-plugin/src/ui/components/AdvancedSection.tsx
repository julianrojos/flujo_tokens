/**
 * AdvancedSection
 *
 * Collapsible wrapper for technical MCP management controls.
 * Sends a RESIZE message to code.ts on expand/collapse.
 */

import React, { useState } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { PortSwitcher } from './PortSwitcher';
import { COLOR, FONT, SPACE, UI_HEIGHT_COLLAPSED, UI_HEIGHT_EXPANDED } from '../styles/tokens';

interface AdvancedSectionProps {
  onPortChanged: (port: number) => void;
  onError: (error: string) => void;
}

export const AdvancedSection: React.FC<AdvancedSectionProps> = ({ onPortChanged, onError }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    parent.postMessage({
      pluginMessage: { type: 'RESIZE', height: next ? UI_HEIGHT_EXPANDED : UI_HEIGHT_COLLAPSED },
    }, '*');
  };

  return (
    <div style={{ borderTop: `1px solid ${COLOR.border}` }}>
      {/* Toggle header */}
      <button
        onClick={toggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: `${SPACE.md}px ${SPACE.lg}px`,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: FONT.size.sm,
          fontWeight: FONT.weight.semibold,
          fontFamily: FONT.family,
          color: COLOR.textMuted,
          textAlign: 'left',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        Advanced
        <span style={{
          fontSize: FONT.size.lg,
          color: COLOR.textMuted,
          transition: 'transform 0.2s',
          transform: isOpen ? 'rotate(90deg)' : 'none',
          display: 'inline-block',
        }}>
          ▶
        </span>
      </button>

      {/* Expandable content — no animation needed, resize handles the feel */}
      {isOpen && (
        <div>
          <ConnectionStatus autoRefresh refreshIntervalMs={10_000} />
          <div style={{ borderTop: `1px solid ${COLOR.border}` }}>
            <PortSwitcher onPortChanged={onPortChanged} onError={onError} />
          </div>
        </div>
      )}
    </div>
  );
};
