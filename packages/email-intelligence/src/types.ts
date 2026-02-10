export interface EmailMessage {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  bodyPreview: string;
  body?: string;
  receivedDateTime: string;
  importance: 'low' | 'normal' | 'high' | 'urgent';
  isRead: boolean;
  hasAttachments: boolean;
  conversationId: string;
  categories?: string[];
  /** Whether user is in TO (direct) or CC */
  isDirect: boolean;
  /** List-Unsubscribe header present */
  hasUnsubscribe?: boolean;
}

export type TriagePriority = 'urgent' | 'action' | 'fyi' | 'spam' | 'newsletter';

export interface TriageResult {
  emailId: string;
  priority: TriagePriority;
  reason: string;
  suggestedAction: 'reply' | 'archive' | 'flag' | 'unsubscribe' | 'none';
  confidence: number;
}

export interface SmartReplyDraft {
  emailId: string;
  replyBody: string;
  tone: 'formal' | 'casual' | 'brief';
  confidence: number;
}

export interface FollowUp {
  id: string;
  emailId: string;
  promiseText: string;
  detectedAt: number;
  dueDate?: number;
  status: 'pending' | 'completed' | 'overdue';
  reminderSent: boolean;
}

export interface ThreadSummary {
  conversationId: string;
  summary: string;
  messageCount: number;
  participants: string[];
  keyPoints: string[];
  actionItems: string[];
  latestTimestamp: string;
}
