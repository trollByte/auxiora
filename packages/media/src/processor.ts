import { getLogger } from '@auxiora/logger';
import type { Attachment, MediaProvider, MediaResult, MediaConfig } from './types.js';
import { DEFAULT_LIMITS } from './types.js';
import { formatMediaResults } from './format.js';

const logger = getLogger('media:processor');

export class MediaProcessor {
  private providers: Map<string, MediaProvider> = new Map();
  private config: Required<MediaConfig>;

  constructor(providers: MediaProvider[], config?: MediaConfig) {
    for (const provider of providers) {
      for (const cap of provider.capabilities) {
        if (!this.providers.has(cap)) {
          this.providers.set(cap, provider);
        }
      }
    }
    this.config = { ...DEFAULT_LIMITS, ...config };
  }

  hasCapability(type: 'audio' | 'image' | 'video' | 'file'): boolean {
    return this.providers.has(type);
  }

  async process(attachments: Attachment[], userText: string): Promise<string> {
    if (!attachments || attachments.length === 0) return userText;

    const results: MediaResult[] = [];

    for (const attachment of attachments) {
      const provider = this.providers.get(attachment.type);
      if (!provider) {
        logger.debug(`No provider for attachment type: ${attachment.type}`);
        continue;
      }

      // Size check
      const maxBytes = this.getMaxBytes(attachment.type);
      if (attachment.size && attachment.size > maxBytes) {
        logger.debug(`Attachment too large: ${attachment.size} > ${maxBytes}`);
        continue;
      }

      try {
        const result = await provider.processAttachment(attachment);
        results.push(result);
      } catch (error) {
        logger.debug('Attachment processing failed', {
          type: attachment.type,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return formatMediaResults(results, userText);
  }

  private getMaxBytes(type: string): number {
    switch (type) {
      case 'audio': return this.config.maxAudioBytes;
      case 'image': return this.config.maxImageBytes;
      case 'video': return this.config.maxVideoBytes;
      case 'file': return this.config.maxFileBytes;
      default: return this.config.maxFileBytes;
    }
  }
}
