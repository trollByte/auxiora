export type Tone = 'formal' | 'professional' | 'casual' | 'brief' | 'friendly' | 'assertive';
export type Platform = 'email' | 'slack' | 'linkedin' | 'twitter' | 'reddit' | 'generic';

export interface ComposeRequest {
  content?: string;
  context: ComposeContext;
  instruction?: string;
}

export interface ComposeContext {
  platform: Platform;
  audience?: string;
  tone?: Tone;
  replyTo?: string;
  maxLength?: number;
}

export interface ComposeResult {
  text: string;
  tone: Tone;
  platform: Platform;
  wordCount: number;
  characterCount: number;
}

export interface Template {
  id: string;
  name: string;
  category: string;
  body: string;
  variables: string[];
  tone: Tone;
}

export interface GrammarIssue {
  type: 'spelling' | 'grammar' | 'style' | 'clarity';
  message: string;
  position: { start: number; end: number };
  suggestion?: string;
  severity: 'error' | 'warning' | 'info';
}

export interface LanguageResult {
  language: string;
  confidence: number;
  script?: string;
}
