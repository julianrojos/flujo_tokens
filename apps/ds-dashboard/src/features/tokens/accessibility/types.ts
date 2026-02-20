export type SemanticColorCategory = "background" | "foreground" | "both";

export interface SemanticColorOption {
  tokenPath: string;
  tokenSlashPath: string;
  cssVar: string;
  label: string;
  hexValue: string;
  category: SemanticColorCategory;
}

export interface WcagContrastResult {
  ratio: number;
  levelA: {
    status: "informative";
    message: string;
  };
  levelAA: {
    normalText: boolean;
    largeText: boolean;
    nonTextUi: boolean;
  };
  levelAAA: {
    normalText: boolean;
    largeText: boolean;
  };
}
