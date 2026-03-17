import { computeContrastRatio } from "./color-utils";
import { WCAG_THRESHOLDS } from "./wcag-constants";
import type {
  ContrastCheckResult,
  ElementType,
  TextSize,
} from "./types";

function roundRatio(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

export function getRequiredRatio(
  elementType: ElementType,
  textSize: TextSize,
): {
  aa: number;
  aaa: number | null;
  criterion: string;
} {
  if (elementType === "icon") {
    return {
      aa: WCAG_THRESHOLDS.ICON_UI.AA,
      aaa: null,
      criterion: WCAG_THRESHOLDS.ICON_UI.criterion,
    };
  }

  if (textSize === "large") {
    return {
      aa: WCAG_THRESHOLDS.TEXT_LARGE.AA,
      aaa: WCAG_THRESHOLDS.TEXT_LARGE.AAA,
      criterion: WCAG_THRESHOLDS.TEXT_LARGE.criterion,
    };
  }

  return {
    aa: WCAG_THRESHOLDS.TEXT_NORMAL.AA,
    aaa: WCAG_THRESHOLDS.TEXT_NORMAL.AAA,
    criterion: WCAG_THRESHOLDS.TEXT_NORMAL.criterion,
  };
}

export function checkContrast(
  backgroundColor: string,
  foregroundColor: string,
  elementType: ElementType,
  textSize: TextSize,
): ContrastCheckResult {
  const ratio = roundRatio(computeContrastRatio(backgroundColor, foregroundColor));
  const required = getRequiredRatio(elementType, textSize);

  return {
    ratio,
    aa: {
      passes: ratio >= required.aa,
      requiredRatio: required.aa,
      criterion: required.criterion,
    },
    aaa: {
      passes:
        required.aaa === null
          ? null
          : ratio >= required.aaa,
      requiredRatio: required.aaa,
      criterion:
        required.aaa === null
          ? "No dedicated WCAG 2.2 AAA criterion for non-text contrast."
          : required.criterion,
    },
    backgroundColor,
    foregroundColor,
    context: {
      elementType,
      textSize,
    },
  };
}
