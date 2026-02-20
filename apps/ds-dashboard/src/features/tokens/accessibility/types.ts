export type SemanticColorCategory = "background" | "foreground" | "both";
export type ElementType = "text" | "icon" | null;
export type TextSize = "normal" | "large";

export interface SemanticColorOption {
  tokenPath: string;
  tokenSlashPath: string;
  cssVar: string;
  label: string;
  hexValue: string;
  category: SemanticColorCategory;
}

export interface ContrastContext {
  elementType: ElementType;
  textSize: TextSize;
}

export interface ContrastLevelResult {
  passes: boolean | null;
  requiredRatio: number | null;
  criterion: string;
}

export interface ContrastCheckResult {
  ratio: number;
  aa: ContrastLevelResult;
  aaa: ContrastLevelResult;
  backgroundColor: string;
  foregroundColor: string;
  context: ContrastContext;
}

export interface TextSizeOption {
  value: TextSize;
  label: string;
  description: string;
  thresholdAA: number;
  thresholdAAA: number;
}
