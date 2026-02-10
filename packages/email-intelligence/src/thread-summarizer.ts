import { getLogger } from '@auxiora/logger';
import type { EmailMessage, ThreadSummary } from './types.js';

const logger = getLogger('email-intelligence:thread-summarizer');

const ACTION_ITEM_PREFIXES = ['action:', 'todo:', 'task:'];
const ACTION_ITEM_KEYWORDS = ['need to', 'should', 'must', 'will'];

export class ThreadSummarizer {
  summarize(messages: EmailMessage[]): ThreadSummary {
    if (messages.length === 0) {
      throw new Error('Cannot summarize an empty thread');
    }

    const conversationId = messages[0].conversationId;
    const participants = this.extractParticipants(messages);
    const keyPoints = this.extractKeyPoints(messages);
    const actionItems = this.extractActionItems(messages);
    const latestTimestamp = this.getLatestTimestamp(messages);
    const subject = messages[0].subject;

    const participantList = participants.length <= 3
      ? participants.join(', ')
      : `${participants.slice(0, 3).join(', ')} and ${participants.length - 3} others`;

    const summary = `${messages.length} messages between ${participantList}. Topic: ${subject}. ${keyPoints.length} key points, ${actionItems.length} action items.`;

    logger.debug('Thread summarized', { conversationId, messageCount: messages.length });

    return {
      conversationId,
      summary,
      messageCount: messages.length,
      participants,
      keyPoints,
      actionItems,
      latestTimestamp,
    };
  }

  private extractParticipants(messages: EmailMessage[]): string[] {
    const participants = new Set<string>();
    for (const msg of messages) {
      participants.add(msg.from);
      for (const to of msg.to) {
        participants.add(to);
      }
      if (msg.cc) {
        for (const cc of msg.cc) {
          participants.add(cc);
        }
      }
    }
    return [...participants];
  }

  private extractKeyPoints(messages: EmailMessage[]): string[] {
    const keyPoints: string[] = [];
    for (const msg of messages) {
      const body = msg.body ?? msg.bodyPreview;
      const sentences = body.split(/[.\n]+/).map(s => s.trim()).filter(Boolean);
      for (const sentence of sentences) {
        // Questions
        if (sentence.includes('?')) {
          keyPoints.push(sentence);
          continue;
        }
        // Sentences with action verbs or dates
        if (/\b(decided|agreed|confirmed|approved|rejected|deadline|due|scheduled)\b/i.test(sentence)) {
          keyPoints.push(sentence);
        }
      }
    }
    return keyPoints;
  }

  private extractActionItems(messages: EmailMessage[]): string[] {
    const actionItems: string[] = [];
    for (const msg of messages) {
      const body = msg.body ?? msg.bodyPreview;
      const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        // Lines starting with action/todo/task prefixes
        if (ACTION_ITEM_PREFIXES.some(prefix => lineLower.startsWith(prefix))) {
          actionItems.push(line);
          continue;
        }
        // Lines containing action keywords
        if (ACTION_ITEM_KEYWORDS.some(kw => lineLower.includes(kw))) {
          actionItems.push(line);
        }
      }
    }
    return actionItems;
  }

  private getLatestTimestamp(messages: EmailMessage[]): string {
    return messages.reduce((latest, msg) =>
      msg.receivedDateTime > latest ? msg.receivedDateTime : latest
    , messages[0].receivedDateTime);
  }
}
