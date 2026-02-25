import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaProcessor } from '../src/processor.js';
import type { Attachment, MediaProvider, MediaResult } from '../src/types.js';
import { detectProviders } from '../src/auto-detect.js';

function mockProvider(caps: string[], handler: (a: Attachment) => Promise<MediaResult>): MediaProvider {
  return {
    id: `mock-${caps.join('-')}`,
    capabilities: caps as any,
    processAttachment: handler,
  };
}

describe('MediaProcessor', () => {
  it('should return user text unchanged when no attachments', async () => {
    const processor = new MediaProcessor([]);
    expect(await processor.process([], 'Hello')).toBe('Hello');
  });

  it('should process audio attachment', async () => {
    const audioProvider = mockProvider(['audio'], async () => ({
      type: 'audio', success: true, text: 'Transcribed text',
    }));
    const processor = new MediaProcessor([audioProvider]);

    const result = await processor.process(
      [{ type: 'audio', url: 'https://example.com/audio.ogg' }],
      'Check this'
    );
    expect(result).toContain('[Audio]\nTranscript: Transcribed text');
    expect(result).toContain('Check this');
  });

  it('should skip attachments with no provider', async () => {
    const processor = new MediaProcessor([]);
    const result = await processor.process(
      [{ type: 'image', url: 'https://example.com/photo.jpg' }],
      'Describe this'
    );
    expect(result).toBe('Describe this');
  });

  it('should skip oversized attachments', async () => {
    const imageProvider = mockProvider(['image'], async () => ({
      type: 'image', success: true, text: 'A photo',
    }));
    const processor = new MediaProcessor([imageProvider]);

    const result = await processor.process(
      [{ type: 'image', url: 'https://example.com/huge.jpg', size: 999_999_999 }],
      'Describe'
    );
    expect(result).toBe('Describe');
  });

  it('should handle provider errors gracefully', async () => {
    const badProvider = mockProvider(['audio'], async () => {
      throw new Error('API down');
    });
    const processor = new MediaProcessor([badProvider]);

    const result = await processor.process(
      [{ type: 'audio', url: 'https://example.com/audio.ogg' }],
      'Check'
    );
    expect(result).toBe('Check');
  });

  it('should process multiple attachments', async () => {
    const audioProvider = mockProvider(['audio'], async () => ({
      type: 'audio', success: true, text: 'Voice note',
    }));
    const imageProvider = mockProvider(['image'], async () => ({
      type: 'image', success: true, text: 'A cat',
    }));
    const processor = new MediaProcessor([audioProvider, imageProvider]);

    const result = await processor.process(
      [
        { type: 'audio', url: 'https://example.com/voice.ogg' },
        { type: 'image', url: 'https://example.com/cat.jpg' },
      ],
      ''
    );
    expect(result).toContain('[Audio]\nTranscript: Voice note');
    expect(result).toContain('[Image]\nDescription: A cat');
  });

  it('should report capabilities', () => {
    const audioProvider = mockProvider(['audio'], async () => ({
      type: 'audio', success: true, text: 'test',
    }));
    const processor = new MediaProcessor([audioProvider]);

    expect(processor.hasCapability('audio')).toBe(true);
    expect(processor.hasCapability('image')).toBe(false);
  });
});

describe('detectProviders', () => {
  it('should always include FileExtractor', () => {
    const providers = detectProviders({ get: () => undefined });
    expect(providers.some((p) => p.id === 'file-extractor')).toBe(true);
  });

  it('should detect Whisper when OpenAI key is available', () => {
    const vault = { get: (k: string) => k === 'OPENAI_API_KEY' ? 'sk-test' : undefined };
    const providers = detectProviders(vault);
    expect(providers.some((p) => p.id === 'whisper')).toBe(true);
  });

  it('should prefer Anthropic for vision', () => {
    const vault = { get: (k: string) => {
      if (k === 'ANTHROPIC_API_KEY') return 'ant-test';
      if (k === 'OPENAI_API_KEY') return 'sk-test';
      return undefined;
    }};
    const providers = detectProviders(vault);
    expect(providers.some((p) => p.id === 'vision-anthropic')).toBe(true);
    expect(providers.some((p) => p.id === 'vision-openai')).toBe(false);
  });

  it('should fall back to OpenAI for vision when no Anthropic key', () => {
    const vault = { get: (k: string) => k === 'OPENAI_API_KEY' ? 'sk-test' : undefined };
    const providers = detectProviders(vault);
    expect(providers.some((p) => p.id === 'vision-openai')).toBe(true);
  });
});
