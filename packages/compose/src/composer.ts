import type { Tone, Platform, ComposeRequest, ComposeResult, ComposeContext } from './types.js';

export class ComposeEngine {
  private defaultTone: Tone;

  constructor(config?: { defaultTone?: Tone }) {
    this.defaultTone = config?.defaultTone ?? 'professional';
  }

  compose(request: ComposeRequest): ComposeResult {
    const tone = request.context.tone ?? this.adaptToneForPlatform(request.context.platform);
    let text = request.content ?? request.instruction ?? '';

    text = this.enforceConstraints(text, request.context);
    text = this.addSignOff(text, tone, request.context.platform);

    return {
      text,
      tone,
      platform: request.context.platform,
      wordCount: this.countWords(text),
      characterCount: text.length,
    };
  }

  private adaptToneForPlatform(platform: Platform): Tone {
    const map: Record<Platform, Tone> = {
      email: 'formal',
      slack: 'casual',
      linkedin: 'professional',
      twitter: 'brief',
      reddit: 'casual',
      generic: 'professional',
    };
    return map[platform];
  }

  private enforceConstraints(text: string, context: ComposeContext): string {
    if (context.platform === 'twitter' && text.length > 280) {
      text = text.slice(0, 277) + '...';
    }

    if (context.maxLength && text.length > context.maxLength) {
      text = text.slice(0, context.maxLength - 3) + '...';
    }

    return text;
  }

  private addSignOff(text: string, tone: Tone, platform: Platform): string {
    if (platform !== 'email' && platform !== 'linkedin') {
      return text;
    }

    const signOffs: Record<Tone, string> = {
      formal: '\n\nBest regards,',
      professional: '\n\nBest,',
      casual: '\n\nThanks!',
      brief: '',
      friendly: '\n\nCheers!',
      assertive: '\n\nRegards,',
    };

    return text + signOffs[tone];
  }

  private countWords(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) return 0;
    return trimmed.split(/\s+/).length;
  }
}
