import { describe, it, expect } from 'vitest';
import {
  ComposeTool,
  GrammarCheckTool,
  DetectLanguageTool,
  ToolPermission,
  setComposeEngine,
  setGrammarChecker,
  setLanguageDetector,
} from '../src/index.js';

describe('ComposeTool', () => {
  it('should have correct name', () => {
    expect(ComposeTool.name).toBe('compose');
  });

  it('should require content parameter', () => {
    const content = ComposeTool.parameters.find(p => p.name === 'content');
    expect(content?.required).toBe(true);
  });

  it('should have optional platform defaulting to generic', () => {
    const platform = ComposeTool.parameters.find(p => p.name === 'platform');
    expect(platform?.required).toBe(false);
    expect(platform?.default).toBe('generic');
  });

  it('should auto-approve (text composition)', () => {
    expect(ComposeTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should fail without engine', async () => {
    setComposeEngine(null);
    const result = await ComposeTool.execute({ content: 'hello' }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('should compose text', async () => {
    setComposeEngine({
      compose: (req: any) => ({
        text: 'Hello there!',
        tone: 'professional',
        platform: req.context.platform,
        wordCount: 2,
        characterCount: 12,
      }),
    });

    const result = await ComposeTool.execute({
      content: 'hello',
      platform: 'email',
      tone: 'professional',
    }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.text).toBe('Hello there!');
    expect(parsed.platform).toBe('email');
    expect(parsed.wordCount).toBe(2);
  });
});

describe('GrammarCheckTool', () => {
  it('should have correct name', () => {
    expect(GrammarCheckTool.name).toBe('grammar_check');
  });

  it('should require text parameter', () => {
    const text = GrammarCheckTool.parameters.find(p => p.name === 'text');
    expect(text?.required).toBe(true);
  });

  it('should auto-approve (read-only analysis)', () => {
    expect(GrammarCheckTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should fail without checker', async () => {
    setGrammarChecker(null);
    const result = await GrammarCheckTool.execute({ text: 'hello' }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('should return grammar issues', async () => {
    setGrammarChecker({
      check: (text: string) => [
        {
          type: 'grammar',
          message: 'Repeated word: "the"',
          position: { start: 10, end: 17 },
          suggestion: 'the',
          severity: 'error',
        },
      ],
    });

    const result = await GrammarCheckTool.execute({ text: 'I went to the the store' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.issueCount).toBe(1);
    expect(parsed.issues[0].type).toBe('grammar');
  });

  it('should return no issues for clean text', async () => {
    setGrammarChecker({
      check: () => [],
    });

    const result = await GrammarCheckTool.execute({ text: 'This is clean.' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.issueCount).toBe(0);
  });
});

describe('DetectLanguageTool', () => {
  it('should have correct name', () => {
    expect(DetectLanguageTool.name).toBe('detect_language');
  });

  it('should require text parameter', () => {
    const text = DetectLanguageTool.parameters.find(p => p.name === 'text');
    expect(text?.required).toBe(true);
  });

  it('should auto-approve (read-only)', () => {
    expect(DetectLanguageTool.getPermission({}, {} as any)).toBe(ToolPermission.AUTO_APPROVE);
  });

  it('should fail without detector', async () => {
    setLanguageDetector(null);
    const result = await DetectLanguageTool.execute({ text: 'hello' }, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not configured');
  });

  it('should detect English', async () => {
    setLanguageDetector({
      detect: () => ({ language: 'english', confidence: 0.92 }),
      isRTL: () => false,
    });

    const result = await DetectLanguageTool.execute({ text: 'The quick brown fox' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.language).toBe('english');
    expect(parsed.confidence).toBe(0.92);
    expect(parsed.isRTL).toBe(false);
  });

  it('should detect RTL languages', async () => {
    setLanguageDetector({
      detect: () => ({ language: 'arabic', confidence: 0.88 }),
      isRTL: (lang: string) => lang === 'arabic',
    });

    const result = await DetectLanguageTool.execute({ text: 'مرحبا بالعالم' }, {} as any);
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output!);
    expect(parsed.language).toBe('arabic');
    expect(parsed.isRTL).toBe(true);
  });
});
