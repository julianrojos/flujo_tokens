import { useCallback, useState } from "react";

import type { SemanticColorOption } from "./types";
import type { ElementType, TextSize } from "./types";
import { checkContrast } from "./utils";

function findColorByPath(
  options: SemanticColorOption[],
  tokenPath: string,
): SemanticColorOption | null {
  return options.find((option) => option.tokenPath === tokenPath) || null;
}

export function useContrastChecker() {
  const [isOpen, setIsOpen] = useState(false);
  const [backgroundTokenPath, setBackgroundTokenPath] = useState("");
  const [foregroundTokenPath, setForegroundTokenPath] = useState("");
  const [includePrimitivesBackground, setIncludePrimitivesBackground] = useState(false);
  const [includePrimitivesForeground, setIncludePrimitivesForeground] = useState(false);
  const [elementType, setElementType] = useState<ElementType>(null);
  const [textSize, setTextSize] = useState<TextSize>("normal");

  const reset = useCallback(() => {
    setBackgroundTokenPath("");
    setForegroundTokenPath("");
    setIncludePrimitivesBackground(false);
    setIncludePrimitivesForeground(false);
    setElementType(null);
    setTextSize("normal");
  }, []);

  const syncWithOptions = useCallback(
    (backgroundOptions: SemanticColorOption[], foregroundOptions: SemanticColorOption[]) => {
      const hasBackground = backgroundOptions.some(
        (option) => option.tokenPath === backgroundTokenPath,
      );
      if (!hasBackground) {
        setBackgroundTokenPath(backgroundOptions[0]?.tokenPath || "");
      }

      const hasForeground = foregroundOptions.some(
        (option) => option.tokenPath === foregroundTokenPath,
      );
      if (!hasForeground) {
        setForegroundTokenPath(foregroundOptions[0]?.tokenPath || "");
      }
    },
    [backgroundTokenPath, foregroundTokenPath],
  );

  const buildResult = useCallback(
    (backgroundOptions: SemanticColorOption[], foregroundOptions: SemanticColorOption[]) => {
      const selectedBackground = findColorByPath(backgroundOptions, backgroundTokenPath);
      const selectedForeground = findColorByPath(foregroundOptions, foregroundTokenPath);
      if (!selectedBackground || !selectedForeground || !elementType) return null;
      return checkContrast(
        selectedBackground.hexValue,
        selectedForeground.hexValue,
        elementType,
        textSize,
      );
    },
    [backgroundTokenPath, foregroundTokenPath, elementType, textSize],
  );

  return {
    isOpen,
    setIsOpen,
    backgroundTokenPath,
    setBackgroundTokenPath,
    foregroundTokenPath,
    setForegroundTokenPath,
    includePrimitivesBackground,
    setIncludePrimitivesBackground,
    includePrimitivesForeground,
    setIncludePrimitivesForeground,
    elementType,
    setElementType,
    textSize,
    setTextSize,
    reset,
    syncWithOptions,
    buildResult,
  };
}
