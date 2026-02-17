import { getLogger } from '@auxiora/logger';
import { safeFetch } from '@auxiora/ssrf-guard';
import type { Attachment, MediaProvider, MediaResult } from '../types.js';

const logger = getLogger('media:vision');

export interface VisionProviderConfig {
  apiKey: string;
  provider: 'anthropic' | 'openai';
  model?: string;
}

export class VisionProvider implements MediaProvider {
  readonly id: string;
  readonly capabilities = ['image', 'video'] as const;
  private apiKey: string;
  private provider: 'anthropic' | 'openai';
  private model: string;

  constructor(config: VisionProviderConfig) {
    this.apiKey = config.apiKey;
    this.provider = config.provider;
    this.model = config.model ?? (config.provider === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4o-mini');
    this.id = `vision-${config.provider}`;
  }

  async processAttachment(attachment: Attachment): Promise<MediaResult> {
    const resultType = attachment.type === 'video' ? 'video' : 'image';
    try {
      let base64Data: string;
      let mediaType = attachment.mimeType ?? 'image/jpeg';

      if (attachment.data) {
        base64Data = attachment.data.toString('base64');
      } else if (attachment.url) {
        if (this.provider === 'openai') {
          return this.describeWithOpenAI(attachment.url, resultType);
        }
        const response = await safeFetch(attachment.url);
        if (!response.ok) {
          return { type: resultType, success: false, error: `Fetch failed: ${response.status}` };
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        base64Data = buffer.toString('base64');
      } else {
        return { type: resultType, success: false, error: 'No data or URL' };
      }

      if (this.provider === 'openai') {
        return this.describeWithOpenAI(`data:${mediaType};base64,${base64Data}`, resultType);
      }

      return this.describeWithAnthropic(base64Data, mediaType, resultType);
    } catch (error) {
      return { type: resultType, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async describeWithAnthropic(base64Data: string, mediaType: string, resultType: 'image' | 'video'): Promise<MediaResult> {
    const prompt = resultType === 'video'
      ? 'Describe what happens in this video. Be concise.'
      : 'Describe this image concisely. Focus on key visual elements.';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { type: resultType, success: false, error: `Anthropic vision error (${response.status}): ${errorText}` };
    }

    const result = await response.json() as { content: Array<{ type: string; text: string }> };
    const text = result.content.find((c) => c.type === 'text')?.text ?? '';

    logger.info('Vision description complete', { type: resultType, textLength: text.length });
    return { type: resultType, success: true, text };
  }

  private async describeWithOpenAI(imageUrl: string, resultType: 'image' | 'video'): Promise<MediaResult> {
    const prompt = resultType === 'video'
      ? 'Describe what happens in this video. Be concise.'
      : 'Describe this image concisely. Focus on key visual elements.';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { type: resultType, success: false, error: `OpenAI vision error (${response.status}): ${errorText}` };
    }

    const result = await response.json() as { choices: Array<{ message: { content: string } }> };
    const text = result.choices[0]?.message?.content ?? '';

    logger.info('Vision description complete', { type: resultType, textLength: text.length });
    return { type: resultType, success: true, text };
  }
}
