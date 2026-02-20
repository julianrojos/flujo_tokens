import { computeContrastRatio } from "./color-utils";
import type { WcagContrastResult } from "./types";

function toFixedRatio(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

export function evaluateWcagContrast(
  backgroundHex: string,
  foregroundHex: string,
): WcagContrastResult {
  const ratio = toFixedRatio(computeContrastRatio(backgroundHex, foregroundHex));

  return {
    ratio,
    levelA: {
      status: "informative",
      message:
        "Level A has no standalone minimum contrast ratio criterion in WCAG 2.2.",
    },
    levelAA: {
      normalText: ratio >= 4.5,
      largeText: ratio >= 3,
      nonTextUi: ratio >= 3,
    },
    levelAAA: {
      normalText: ratio >= 7,
      largeText: ratio >= 4.5,
    },
  };
}
