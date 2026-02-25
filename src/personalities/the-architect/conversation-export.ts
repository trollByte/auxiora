import type { ContextDomain, EmotionalRegister, TraitSource } from '../schema.js';
import type { EmotionalTrajectory } from './emotional-tracker.js';
import type { ContextRecommendation } from './recommender.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Personality engine output attached to assistant messages. */
  metadata?: AssistantMetadata;
}

export interface AssistantMetadata {
  domain: ContextDomain;
  emotionalRegister: EmotionalRegister;
  emotionalTrajectory?: EmotionalTrajectory;
  conversationTheme?: ContextDomain;
  corrected?: boolean;
  originalDomain?: ContextDomain;
  confidence?: number;
  stakes: string;
  complexity: string;
  activeTraits: TraitSource[];
  customWeightsApplied?: Partial<Record<string, number>>;
  recommendation?: ContextRecommendation;
}

export interface ExportedMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  context?: {
    domain: ContextDomain;
    emotionalRegister: EmotionalRegister;
    emotionalTrajectory?: EmotionalTrajectory;
    conversationTheme?: ContextDomain;
    corrected?: boolean;
    originalDomain?: ContextDomain;
    confidence?: number;
    stakes: string;
    complexity: string;
  };
  activeTraits?: Array<{
    traitName: string;
    weight: number;
    sourceName: string;
  }>;
  customWeightsApplied?: Partial<Record<string, number>>;
  recommendation?: ContextRecommendation;
}

export interface ExportedConversation {
  id: string;
  title: string;
  exportedAt: number;
  messageCount: number;
  messages: ExportedMessage[];
  summary: {
    dominantContexts: Array<{ domain: ContextDomain; percentage: number }>;
    emotionalArc: EmotionalRegister[];
    correctionsApplied: number;
    uniqueSourcesReferenced: string[];
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Human-readable label for a domain. */
function domainLabel(domain: ContextDomain): string {
  return domain
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Domain emoji for markdown output. */
const DOMAIN_EMOJI: Partial<Record<ContextDomain, string>> = {
  security_review: '🛡️',
  code_engineering: '💻',
  architecture_design: '🏗️',
  debugging: '🔍',
  team_leadership: '👥',
  one_on_one: '🤝',
  sales_pitch: '💰',
  negotiation: '🤝',
  marketing_content: '📣',
  strategic_planning: '📊',
  crisis_management: '🚨',
  creative_work: '🎨',
  writing_content: '✍️',
  decision_making: '⚖️',
  learning_research: '📚',
  personal_development: '🌱',
  general: '💬',
};

/** Escape a CSV field value — wraps in quotes if it contains commas, quotes, or newlines. */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Auto-generate a title from the first user message. */
function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'Empty Conversation';
  const text = firstUser.content.trim();
  if (text.length <= 60) return text;
  return text.slice(0, 57) + '...';
}

// ────────────────────────────────────────────────────────────────────────────
// ConversationExporter
// ────────────────────────────────────────────────────────────────────────────

export class ConversationExporter {
  /**
   * Build an export from conversation messages with their metadata.
   */
  export(messages: ChatMessage[], conversationId: string): ExportedConversation {
    const exportedMessages: ExportedMessage[] = messages.map(msg => {
      if (msg.role === 'user' || !msg.metadata) {
        return { role: msg.role, content: msg.content, timestamp: msg.timestamp };
      }

      const meta = msg.metadata;
      return {
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        context: {
          domain: meta.domain,
          emotionalRegister: meta.emotionalRegister,
          emotionalTrajectory: meta.emotionalTrajectory,
          conversationTheme: meta.conversationTheme,
          corrected: meta.corrected,
          originalDomain: meta.originalDomain,
          confidence: meta.confidence,
          stakes: meta.stakes,
          complexity: meta.complexity,
        },
        activeTraits: meta.activeTraits.map(t => ({
          traitName: t.traitKey,
          weight: parseFloat(t.traitKey), // placeholder — actual weight comes from the mix
          sourceName: t.sourceName,
        })),
        customWeightsApplied: meta.customWeightsApplied,
        recommendation: meta.recommendation,
      };
    });

    // Fix activeTraits weight: we don't have the actual mix weight here, so
    // we set weight from the trait data as-is. The caller provides the
    // full trait source which already has behavioralInstruction etc.
    // For export, we'll use a default weight of 1.0 for active traits since
    // they were deemed active by the threshold in getActiveSources.
    for (const msg of exportedMessages) {
      if (msg.activeTraits) {
        for (const trait of msg.activeTraits) {
          trait.weight = 1.0;
        }
      }
    }

    const summary = this.buildSummary(exportedMessages);

    return {
      id: conversationId,
      title: generateTitle(messages),
      exportedAt: Date.now(),
      messageCount: messages.length,
      messages: exportedMessages,
      summary,
    };
  }

  /** Export to JSON string. */
  toJSON(conversation: ExportedConversation): string {
    return JSON.stringify(conversation, null, 2);
  }

  /** Export to Markdown (human-readable report). */
  toMarkdown(conversation: ExportedConversation): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Conversation: ${conversation.title}`);
    lines.push('');
    const date = new Date(conversation.exportedAt).toISOString().split('T')[0];
    lines.push(`**Date:** ${date} | **Messages:** ${conversation.messageCount}`);

    // Dominant contexts
    if (conversation.summary.dominantContexts.length > 0) {
      const contexts = conversation.summary.dominantContexts
        .map(c => `${domainLabel(c.domain)} (${Math.round(c.percentage)}%)`)
        .join(', ');
      lines.push(`**Dominant contexts:** ${contexts}`);
    }

    // Sources referenced
    if (conversation.summary.uniqueSourcesReferenced.length > 0) {
      lines.push(`**Historical minds referenced:** ${conversation.summary.uniqueSourcesReferenced.join(', ')}`);
    }

    if (conversation.summary.correctionsApplied > 0) {
      lines.push(`**Corrections applied:** ${conversation.summary.correctionsApplied}`);
    }

    lines.push('');

    // Messages
    for (const msg of conversation.messages) {
      lines.push('---');
      lines.push('');

      if (msg.role === 'user') {
        lines.push(`**You:** ${msg.content}`);
      } else {
        // Build assistant header
        const emoji = msg.context ? (DOMAIN_EMOJI[msg.context.domain] ?? '💬') : '💬';
        const domainStr = msg.context ? domainLabel(msg.context.domain) : 'General';
        const confidenceStr = msg.context?.confidence != null
          ? (msg.context.confidence >= 0.8 ? 'Confident' : msg.context.confidence >= 0.5 ? 'Moderate' : 'Low confidence')
          : '';
        const headerParts = [emoji, domainStr];
        if (confidenceStr) headerParts.push(`· ${confidenceStr}`);

        lines.push(`**Architect** [${headerParts.join(' ')}]:`);
        lines.push(msg.content);

        // Active traits
        if (msg.activeTraits && msg.activeTraits.length > 0) {
          const traitList = msg.activeTraits
            .slice(0, 8) // top 8 to avoid clutter
            .map(t => `${formatTraitName(t.traitName)} (${t.sourceName})`)
            .join(', ');
          lines.push(`*Active: ${traitList}*`);
        }

        // Correction note
        if (msg.context?.corrected && msg.context.originalDomain) {
          lines.push(`*Corrected from ${domainLabel(msg.context.originalDomain)}*`);
        }
      }

      lines.push('');
    }

    lines.push('---');
    return lines.join('\n');
  }

  /** Export to CSV (one row per assistant message for analysis). */
  toCSV(conversation: ExportedConversation): string {
    const headers = [
      'timestamp', 'domain', 'emotion', 'trajectory', 'stakes', 'complexity', 'confidence',
      'top_trait_1', 'top_trait_1_weight', 'top_trait_1_source',
      'top_trait_2', 'top_trait_2_weight', 'top_trait_2_source',
      'top_trait_3', 'top_trait_3_weight', 'top_trait_3_source',
      'top_trait_4', 'top_trait_4_weight', 'top_trait_4_source',
      'top_trait_5', 'top_trait_5_weight', 'top_trait_5_source',
      'correction_applied', 'recommendation_shown',
    ];

    const rows: string[] = [headers.join(',')];

    for (const msg of conversation.messages) {
      if (msg.role !== 'assistant' || !msg.context) continue;

      const traits = msg.activeTraits ?? [];
      const top5 = traits.slice(0, 5);

      const fields: string[] = [
        String(msg.timestamp),
        csvEscape(msg.context.domain),
        csvEscape(msg.context.emotionalRegister),
        csvEscape(msg.context.emotionalTrajectory ?? ''),
        csvEscape(msg.context.stakes),
        csvEscape(msg.context.complexity),
        msg.context.confidence != null ? String(msg.context.confidence) : '',
      ];

      // Top 5 traits (3 columns each)
      for (let i = 0; i < 5; i++) {
        if (i < top5.length) {
          fields.push(csvEscape(top5[i].traitName));
          fields.push(String(top5[i].weight));
          fields.push(csvEscape(top5[i].sourceName));
        } else {
          fields.push('', '', '');
        }
      }

      fields.push(msg.context.corrected ? 'true' : 'false');
      fields.push(msg.recommendation ? 'true' : 'false');

      rows.push(fields.join(','));
    }

    return rows.join('\n');
  }

  // ── Private ────────────────────────────────────────────────────────────

  private buildSummary(messages: ExportedMessage[]): ExportedConversation['summary'] {
    const assistantMessages = messages.filter(m => m.role === 'assistant' && m.context);

    // Dominant contexts
    const domainCounts = new Map<ContextDomain, number>();
    for (const msg of assistantMessages) {
      const domain = msg.context!.domain;
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    }
    const totalAssistant = assistantMessages.length || 1;
    const dominantContexts = Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, percentage: (count / totalAssistant) * 100 }))
      .sort((a, b) => b.percentage - a.percentage);

    // Emotional arc — one emotion per assistant turn
    const emotionalArc: EmotionalRegister[] = assistantMessages
      .map(m => m.context!.emotionalRegister);

    // Corrections applied
    const correctionsApplied = assistantMessages
      .filter(m => m.context!.corrected === true).length;

    // Unique sources
    const sourceSet = new Set<string>();
    for (const msg of assistantMessages) {
      if (msg.activeTraits) {
        for (const trait of msg.activeTraits) {
          sourceSet.add(trait.sourceName);
        }
      }
    }
    const uniqueSourcesReferenced = Array.from(sourceSet).sort();

    return { dominantContexts, emotionalArc, correctionsApplied, uniqueSourcesReferenced };
  }
}

/** Format a camelCase trait key into human-readable form. */
function formatTraitName(key: string): string {
  // "adversarialThinking" → "Adversarial Thinking"
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, c => c.toUpperCase())
    .trim();
}
