import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalCloseButton,
} from "@/components/ui/overlay";
import type {
  ContrastCheckResult,
  ElementType,
  SemanticColorOption,
  TextSize,
} from "./types";
import { ColorPreview } from "./color-preview";
import { ColorSelect } from "./color-select";
import { ContrastResult } from "./contrast-result";
import { ElementTypeSelector } from "./element-type-selector";
import { TextSizeSelector } from "./text-size-selector";

interface ContrastCheckerModalProps {
  open: boolean;
  onClose: () => void;
  backgroundOptions: SemanticColorOption[];
  foregroundOptions: SemanticColorOption[];
  backgroundTokenPath: string;
  foregroundTokenPath: string;
  onBackgroundChange: (tokenPath: string) => void;
  onForegroundChange: (tokenPath: string) => void;
  includePrimitivesBackground: boolean;
  onIncludePrimitivesBackgroundChange: (value: boolean) => void;
  includePrimitivesForeground: boolean;
  onIncludePrimitivesForegroundChange: (value: boolean) => void;
  elementType: ElementType;
  onElementTypeChange: (elementType: ElementType) => void;
  textSize: TextSize;
  onTextSizeChange: (textSize: TextSize) => void;
  result: ContrastCheckResult | null;
  onReset: () => void;
}

function findByPath(
  options: SemanticColorOption[],
  tokenPath: string,
): SemanticColorOption | null {
  return options.find((option) => option.tokenPath === tokenPath) || null;
}

export function ContrastCheckerModal({
  open,
  onClose,
  backgroundOptions,
  foregroundOptions,
  backgroundTokenPath,
  foregroundTokenPath,
  onBackgroundChange,
  onForegroundChange,
  includePrimitivesBackground,
  onIncludePrimitivesBackgroundChange,
  includePrimitivesForeground,
  onIncludePrimitivesForegroundChange,
  elementType,
  onElementTypeChange,
  textSize,
  onTextSizeChange,
  result,
  onReset,
}: ContrastCheckerModalProps) {
  const selectedBackground = useMemo(
    () => findByPath(backgroundOptions, backgroundTokenPath),
    [backgroundOptions, backgroundTokenPath],
  );
  const selectedForeground = useMemo(
    () => findByPath(foregroundOptions, foregroundTokenPath),
    [foregroundOptions, foregroundTokenPath],
  );

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent size="full" className="max-h-[92vh] overflow-y-auto">
        <ModalHeader>
          <div>
            <h3
              id="color-accessibility-checker-title"
              className="text-base font-titles font-semibold"
            >
              Color Accessibility Checker
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Check color contrast between a background and a foreground.
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </ModalHeader>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <ColorSelect
              label="Background (Semantic)"
              options={backgroundOptions}
              value={backgroundTokenPath}
              onChange={onBackgroundChange}
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={includePrimitivesBackground}
                onChange={(event) =>
                  onIncludePrimitivesBackgroundChange(event.target.checked)
                }
              />
              Include primitive colors in background options
            </label>
          </div>
          <div>
            <ColorSelect
              label="Foreground (Text/Icon Semantic)"
              options={foregroundOptions}
              value={foregroundTokenPath}
              onChange={onForegroundChange}
            />
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={includePrimitivesForeground}
                onChange={(event) =>
                  onIncludePrimitivesForegroundChange(event.target.checked)
                }
              />
              Include primitive colors in foreground options
            </label>
          </div>

          <div className="md:col-span-2">
            <ElementTypeSelector value={elementType} onChange={onElementTypeChange} />
          </div>

          <div className="md:col-span-2">
            <TextSizeSelector
              value={textSize}
              onChange={onTextSizeChange}
              disabled={elementType !== "text"}
            />
          </div>
        </div>

        <div className="border-t border-border/70 p-5 space-y-4">
          {selectedBackground && selectedForeground ? (
            <ColorPreview
              backgroundColor={selectedBackground.hexValue}
              foregroundColor={selectedForeground.hexValue}
              elementType={elementType}
            />
          ) : null}

          <ContrastResult result={result} />

          <ModalFooter className="border-t-0 p-0">
            <Button variant="outline" onClick={onReset}>
              Reset
            </Button>
            <Button variant="default" onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </div>
      </ModalContent>
    </Modal>
  );
}
