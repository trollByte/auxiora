import type { ThinkingLevel } from './types.js';

/**
 * Map ThinkingLevel to Anthropic budget_tokens for the thinking block.
 * Returns undefined for 'off' (no thinking).
 */
export function getAnthropicThinkingBudget(level: ThinkingLevel): number | undefined {
  switch (level) {
    case 'off': return undefined;
    case 'low': return 1024;
    case 'medium': return 4096;
    case 'high': return 10000;
    case 'xhigh': return 32000;
  }
}

/**
 * Map ThinkingLevel to OpenAI reasoning_effort for o-series models.
 * Returns undefined for 'off'.
 */
export function getOpenAIReasoningEffort(level: ThinkingLevel): 'low' | 'medium' | 'high' | undefined {
  switch (level) {
    case 'off': return undefined;
    case 'low': return 'low';
    case 'medium': return 'medium';
    case 'high': return 'high';
    case 'xhigh': return 'high'; // OpenAI maxes at 'high'
  }
}

/**
 * Check if an OpenAI model supports reasoning_effort (o-series).
 */
export function isOpenAIReasoningModel(model: string): boolean {
  return model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')
    || model.startsWith('gpt-5');
}
