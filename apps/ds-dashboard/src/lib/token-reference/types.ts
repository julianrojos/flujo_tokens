export interface ResolvedVariableRef {
  /** Label shown before the bracket: tokenPath or the raw input text */
  tokenLabel: string;
  /** null when no value or alias could be resolved */
  bracketLabel: string | null;
  /** Debug context — do NOT render in UI */
  debug: {
    inputText: string;
    isAlias: boolean;
    aliasTarget: string | null;
    resolvedValue: string | null;
    hadFallback: boolean;
  };
}

