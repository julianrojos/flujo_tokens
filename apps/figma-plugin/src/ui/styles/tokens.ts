/**
 * Design tokens for the Figma Plugin UI.
 *
 * Single source of truth for colors, typography, spacing, and layout
 * constants. All components import from here — never use inline magic values.
 */

import { PLUGIN_UI_WIDTH } from '../../shared/ui-dimensions';

export const COLOR = {
  // Semantic status colors (Figma-native palette)
  connected:    '#1BC47D',
  disconnected: '#F24822',
  mismatch:     '#FFA629',
  fallback:     '#0D99FF',
  unknown:      '#B3B3B3',

  // Surfaces
  bg:           '#F5F5F5',
  surface:      '#FFFFFF',
  border:       '#E6E6E6',
  borderStrong: '#C4C4C4',

  // Text
  textPrimary:   '#1E1E1E',
  textSecondary: '#666666',
  textMuted:     '#999999',

  // Accent (CTA button)
  accent:      '#0D99FF',
  accentHover: '#007BE5',
  accentText:  '#FFFFFF',

  // Danger (error states)
  danger:     '#F24822',
  dangerBg:   '#FFF0ED',
  dangerText: '#C41800',

  // Success
  success:     '#1BC47D',
  successBg:   '#EDFAF3',
  successText: '#0D7D50',
} as const;

export const FONT = {
  family: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  size: {
    xs: '10px',
    sm: '11px',
    md: '12px',
    lg: '13px',
    xl: '14px',
    h1: '20px',
  },
  weight: {
    regular:  400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },
  lineHeight: {
    tight:  1.2,
    normal: 1.5,
  },
} as const;

export const SPACE = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
} as const;

export const RADIUS = {
  sm:   4,
  md:   8,
  lg:   12,
  full: 9999,
} as const;

export const UI_WIDTH = PLUGIN_UI_WIDTH;
