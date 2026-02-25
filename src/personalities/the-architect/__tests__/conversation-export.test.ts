import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationExporter } from '../conversation-export.js';
import type { ChatMessage, ExportedConversation } from '../conversation-export.js';
import { createArchitect } from '../index.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

let exporter: ConversationExporter;

function userMsg(content: string, timestamp = Date.now()): ChatMessage {
  return { role: 'user', content, timestamp };
}

function assistantMsg(content: string, timestamp = Date.now()): ChatMessage {
  return {
    role: 'assistant',
    content,
    timestamp,
    metadata: {
      domain: 'security_review',
      emotionalRegister: 'neutral',
      emotionalTrajectory: 'stable',
      conversationTheme: 'security_review',
      corrected: false,
      confidence: 0.85,
      stakes: 'high',
      complexity: 'deep_analysis',
      activeTraits: [
        {
          traitKey: 'adversarialThinking',
          sourceName: 'Andy Grove / Sun Tzu',
          sourceWork: 'Only the Paranoid Survive / The Art of War',
          evidenceSummary: 'Think like the attacker.',
          behavioralInstruction: 'Assume intelligent adversaries.',
        },
        {
          traitKey: 'paranoidVigilance',
          sourceName: 'Andy Grove',
          sourceWork: 'Only the Paranoid Survive',
          evidenceSummary: 'Complacency kills.',
          behavioralInstruction: 'Watch for subtle signals.',
        },
      ],
      customWeightsApplied: { adversarialThinking: 0.2 },
      recommendation: undefined,
    },
  };
}

function correctedAssistantMsg(content: string, timestamp = Date.now()): ChatMessage {
  return {
    role: 'assistant',
    content,
    timestamp,
    metadata: {
      domain: 'debugging',
      emotionalRegister: 'frustrated',
      emotionalTrajectory: 'escalating',
      corrected: true,
      originalDomain: 'code_engineering',
      confidence: 0.6,
      stakes: 'moderate',
      complexity: 'moderate',
      activeTraits: [
        {
          traitKey: 'firstPrinciples',
          sourceName: 'Elon Musk / Isaac Newton',
          sourceWork: 'SpaceX interviews / Principia Mathematica',
          evidenceSummary: 'Decompose to fundamentals.',
          behavioralInstruction: 'Strip away assumptions.',
        },
      ],
    },
  };
}

function sampleMessages(): ChatMessage[] {
  const base = 1700000000000;
  return [
    userMsg('Review this code for security vulnerabilities', base),
    assistantMsg('I found several issues...', base + 1000),
    userMsg('What about the authentication flow?', base + 2000),
    assistantMsg('The auth flow has three concerns...', base + 3000),
    userMsg('This bug keeps coming back, I am frustrated', base + 4000),
    correctedAssistantMsg('Let me help you trace the root cause...', base + 5000),
  ];
}

beforeEach(() => {
  exporter = new ConversationExporter();
});

// ────────────────────────────────────────────────────────────────────────────
// Export structure
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationExporter — export', () => {
  it('returns correct conversation structure', () => {
    const result = exporter.export(sampleMessages(), 'conv-123');
    expect(result.id).toBe('conv-123');
    expect(result.messageCount).toBe(6);
    expect(result.messages).toHaveLength(6);
    expect(result.exportedAt).toBeGreaterThan(0);
  });

  it('auto-generates title from first user message', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    expect(result.title).toBe('Review this code for security vulnerabilities');
  });

  it('truncates long titles to 60 characters', () => {
    const longMessage = 'A'.repeat(100);
    const messages = [userMsg(longMessage), assistantMsg('ok')];
    const result = exporter.export(messages, 'conv-1');
    expect(result.title.length).toBeLessThanOrEqual(60);
    expect(result.title).toContain('...');
  });

  it('handles empty conversations', () => {
    const result = exporter.export([], 'empty');
    expect(result.title).toBe('Empty Conversation');
    expect(result.messageCount).toBe(0);
    expect(result.messages).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Message metadata
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationExporter — message metadata', () => {
  it('user messages have no personality metadata', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    const userMessages = result.messages.filter(m => m.role === 'user');
    for (const msg of userMessages) {
      expect(msg.context).toBeUndefined();
      expect(msg.activeTraits).toBeUndefined();
      expect(msg.customWeightsApplied).toBeUndefined();
      expect(msg.recommendation).toBeUndefined();
    }
  });

  it('assistant messages include context metadata', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    const first = result.messages[1]; // first assistant
    expect(first.context).toBeDefined();
    expect(first.context!.domain).toBe('security_review');
    expect(first.context!.emotionalRegister).toBe('neutral');
    expect(first.context!.emotionalTrajectory).toBe('stable');
    expect(first.context!.stakes).toBe('high');
    expect(first.context!.complexity).toBe('deep_analysis');
    expect(first.context!.confidence).toBe(0.85);
  });

  it('assistant messages include active traits', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    const first = result.messages[1];
    expect(first.activeTraits).toBeDefined();
    expect(first.activeTraits!.length).toBe(2);
    expect(first.activeTraits![0].traitName).toBe('adversarialThinking');
    expect(first.activeTraits![0].sourceName).toBe('Andy Grove / Sun Tzu');
  });

  it('assistant messages include custom weights when applied', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    const first = result.messages[1];
    expect(first.customWeightsApplied).toEqual({ adversarialThinking: 0.2 });
  });

  it('corrected messages include correction metadata', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    const corrected = result.messages[5]; // last assistant message
    expect(corrected.context!.corrected).toBe(true);
    expect(corrected.context!.originalDomain).toBe('code_engineering');
    expect(corrected.context!.domain).toBe('debugging');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationExporter — summary', () => {
  it('calculates dominant contexts by percentage', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    const { dominantContexts } = result.summary;
    expect(dominantContexts.length).toBeGreaterThan(0);

    // 2 security_review + 1 debugging = 66.7% security, 33.3% debugging
    const security = dominantContexts.find(c => c.domain === 'security_review');
    expect(security).toBeDefined();
    expect(Math.round(security!.percentage)).toBeCloseTo(67, 0);

    const debugging = dominantContexts.find(c => c.domain === 'debugging');
    expect(debugging).toBeDefined();
    expect(Math.round(debugging!.percentage)).toBeCloseTo(33, 0);
  });

  it('sorts dominant contexts by percentage descending', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    const percentages = result.summary.dominantContexts.map(c => c.percentage);
    for (let i = 1; i < percentages.length; i++) {
      expect(percentages[i]).toBeLessThanOrEqual(percentages[i - 1]);
    }
  });

  it('captures emotional arc from assistant messages', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    expect(result.summary.emotionalArc).toEqual(['neutral', 'neutral', 'frustrated']);
  });

  it('counts corrections applied', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    expect(result.summary.correctionsApplied).toBe(1);
  });

  it('collects unique sources referenced', () => {
    const result = exporter.export(sampleMessages(), 'conv-1');
    const { uniqueSourcesReferenced } = result.summary;
    expect(uniqueSourcesReferenced).toContain('Andy Grove / Sun Tzu');
    expect(uniqueSourcesReferenced).toContain('Andy Grove');
    expect(uniqueSourcesReferenced).toContain('Elon Musk / Isaac Newton');
    // Sorted alphabetically
    expect(uniqueSourcesReferenced).toEqual([...uniqueSourcesReferenced].sort());
  });
});

// ────────────────────────────────────────────────────────────────────────────
// JSON format
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationExporter — toJSON', () => {
  it('returns valid JSON string', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const json = exporter.toJSON(conversation);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('round-trips correctly', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const json = exporter.toJSON(conversation);
    const parsed = JSON.parse(json) as ExportedConversation;
    expect(parsed.id).toBe(conversation.id);
    expect(parsed.messageCount).toBe(conversation.messageCount);
    expect(parsed.messages).toHaveLength(conversation.messages.length);
    expect(parsed.summary.dominantContexts).toEqual(conversation.summary.dominantContexts);
    expect(parsed.summary.emotionalArc).toEqual(conversation.summary.emotionalArc);
    expect(parsed.summary.uniqueSourcesReferenced).toEqual(conversation.summary.uniqueSourcesReferenced);
  });

  it('is pretty-printed with 2-space indent', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const json = exporter.toJSON(conversation);
    expect(json).toContain('\n  ');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Markdown format
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationExporter — toMarkdown', () => {
  it('includes conversation title as heading', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const md = exporter.toMarkdown(conversation);
    expect(md).toContain('# Conversation: Review this code for security vulnerabilities');
  });

  it('includes message count and date', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const md = exporter.toMarkdown(conversation);
    expect(md).toContain('**Messages:** 6');
    expect(md).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);
  });

  it('formats user messages with "You:" prefix', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const md = exporter.toMarkdown(conversation);
    expect(md).toContain('**You:** Review this code for security vulnerabilities');
  });

  it('formats assistant messages with domain and emoji', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const md = exporter.toMarkdown(conversation);
    expect(md).toContain('**Architect** [🛡️ Security Review');
  });

  it('lists active traits for assistant messages', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const md = exporter.toMarkdown(conversation);
    expect(md).toContain('*Active:');
    expect(md).toContain('Adversarial Thinking (Andy Grove / Sun Tzu)');
  });

  it('notes corrections when applied', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const md = exporter.toMarkdown(conversation);
    expect(md).toContain('*Corrected from Code Engineering*');
  });

  it('includes dominant contexts in header', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const md = exporter.toMarkdown(conversation);
    expect(md).toContain('**Dominant contexts:**');
    expect(md).toContain('Security Review');
  });

  it('includes historical minds referenced', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const md = exporter.toMarkdown(conversation);
    expect(md).toContain('**Historical minds referenced:**');
    expect(md).toContain('Andy Grove');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CSV format
// ────────────────────────────────────────────────────────────────────────────

describe('ConversationExporter — toCSV', () => {
  it('has correct header row', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const csv = exporter.toCSV(conversation);
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toContain('timestamp');
    expect(headerLine).toContain('domain');
    expect(headerLine).toContain('emotion');
    expect(headerLine).toContain('trajectory');
    expect(headerLine).toContain('top_trait_1');
    expect(headerLine).toContain('top_trait_1_weight');
    expect(headerLine).toContain('top_trait_1_source');
    expect(headerLine).toContain('top_trait_5');
    expect(headerLine).toContain('correction_applied');
    expect(headerLine).toContain('recommendation_shown');
  });

  it('has one data row per assistant message', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const csv = exporter.toCSV(conversation);
    const lines = csv.split('\n');
    // header + 3 assistant messages
    expect(lines.length).toBe(4);
  });

  it('includes domain and emotion in rows', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const csv = exporter.toCSV(conversation);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('security_review');
    expect(lines[1]).toContain('neutral');
    expect(lines[3]).toContain('debugging');
    expect(lines[3]).toContain('frustrated');
  });

  it('escapes CSV fields containing commas', () => {
    const messages: ChatMessage[] = [
      userMsg('test'),
      {
        role: 'assistant',
        content: 'response',
        timestamp: Date.now(),
        metadata: {
          domain: 'general',
          emotionalRegister: 'neutral',
          stakes: 'low',
          complexity: 'quick_answer',
          activeTraits: [{
            traitKey: 'simplification',
            sourceName: 'Jobs, Shannon',  // comma in source name
            sourceWork: 'Various',
            evidenceSummary: 'Simplify.',
            behavioralInstruction: 'Remove until essential.',
          }],
        },
      },
    ];

    const conversation = exporter.export(messages, 'csv-test');
    const csv = exporter.toCSV(conversation);
    // The comma-containing field should be quoted
    expect(csv).toContain('"Jobs, Shannon"');
  });

  it('marks correction_applied correctly', () => {
    const conversation = exporter.export(sampleMessages(), 'conv-1');
    const csv = exporter.toCSV(conversation);
    const lines = csv.split('\n');
    // First two assistant rows: no correction
    expect(lines[1]).toContain('false');
    // Third assistant row: corrected
    expect(lines[3]).toContain('true');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TheArchitect integration
// ────────────────────────────────────────────────────────────────────────────

describe('TheArchitect — exportConversation', () => {
  it('delegates to ConversationExporter', () => {
    const architect = createArchitect();
    const messages = sampleMessages();
    const result = architect.exportConversation(messages, 'test-conv');
    expect(result.id).toBe('test-conv');
    expect(result.messageCount).toBe(6);
  });

  it('exportConversationAs returns JSON format', () => {
    const architect = createArchitect();
    const json = architect.exportConversationAs(sampleMessages(), 'conv-1', 'json');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('exportConversationAs returns Markdown format', () => {
    const architect = createArchitect();
    const md = architect.exportConversationAs(sampleMessages(), 'conv-1', 'markdown');
    expect(md).toContain('# Conversation:');
  });

  it('exportConversationAs returns CSV format', () => {
    const architect = createArchitect();
    const csv = architect.exportConversationAs(sampleMessages(), 'conv-1', 'csv');
    expect(csv.split('\n')[0]).toContain('timestamp');
  });
});
