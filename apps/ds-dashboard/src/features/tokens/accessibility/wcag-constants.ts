import type { TextSizeOption } from "./types";

export const WCAG_THRESHOLDS = {
  TEXT_NORMAL: {
    AA: 4.5,
    AAA: 7,
    criterion: "WCAG 2.2 SC 1.4.3 / 1.4.6 (normal text)",
  },
  TEXT_LARGE: {
    AA: 3,
    AAA: 4.5,
    criterion: "WCAG 2.2 SC 1.4.3 / 1.4.6 (large text)",
  },
  ICON_UI: {
    AA: 3,
    criterion: "WCAG 2.2 SC 1.4.11 (non-text contrast)",
  },
} as const;

export const TEXT_SIZE_OPTIONS: TextSizeOption[] = [
  {
    value: "normal",
    label: "Normal",
    description: "< 24px (18pt) or < 18.5px (14pt) bold",
    thresholdAA: WCAG_THRESHOLDS.TEXT_NORMAL.AA,
    thresholdAAA: WCAG_THRESHOLDS.TEXT_NORMAL.AAA,
  },
  {
    value: "large",
    label: "Large",
    description: ">= 24px (18pt) or >= 18.5px (14pt) bold",
    thresholdAA: WCAG_THRESHOLDS.TEXT_LARGE.AA,
    thresholdAAA: WCAG_THRESHOLDS.TEXT_LARGE.AAA,
  },
];
