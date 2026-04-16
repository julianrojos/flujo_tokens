import type { AiProviderName } from './ai-jobs';

export const AI_PROVIDER_ORDER: readonly AiProviderName[] = [
  'anthropic',
  'gemini',
  'ollama',
  'openai',
  'opencode',
];

export const AI_PROVIDER_LABELS: Readonly<Record<AiProviderName, string>> = {
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google (Gemini)',
  ollama: 'Ollama (Local)',
  openai: 'OpenAI',
  opencode: 'OpenCode',
};
