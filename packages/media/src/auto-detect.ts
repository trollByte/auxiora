import { getLogger } from '@auxiora/logger';
import type { MediaProvider } from './types.js';
import { WhisperProvider } from './providers/whisper.js';
import { VisionProvider } from './providers/vision.js';
import { FileExtractor } from './providers/file-extractor.js';

const logger = getLogger('media:auto-detect');

export interface VaultLike {
  get(key: string): string | undefined;
}

export function detectProviders(vault: VaultLike): MediaProvider[] {
  const providers: MediaProvider[] = [];

  // File extractor always available
  providers.push(new FileExtractor());

  // Audio: OpenAI Whisper
  const openaiKey = vault.get('OPENAI_API_KEY');
  if (openaiKey) {
    providers.push(new WhisperProvider({ apiKey: openaiKey }));
    logger.info('Audio provider detected: OpenAI Whisper');
  }

  // Vision: prefer Anthropic, fall back to OpenAI
  const anthropicKey = vault.get('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    providers.push(new VisionProvider({ apiKey: anthropicKey, provider: 'anthropic' }));
    logger.info('Vision provider detected: Anthropic');
  } else if (openaiKey) {
    providers.push(new VisionProvider({ apiKey: openaiKey, provider: 'openai' }));
    logger.info('Vision provider detected: OpenAI');
  }

  return providers;
}
